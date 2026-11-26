import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRole } from '@dfarm/shared-types';
import { getAdminSupabaseClient, createUserSupabaseClient } from '../config/supabase.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/app-error.js';
import { verifyJwt } from '../jwt.js';
import { pool } from '../config/db.js';
import { hashToken, verifyDeviceToken } from '../security.js';
import { tokenRevocationService } from '../infrastructure/security/TokenRevocationService.js';
import { accountAuthorityService } from '../infrastructure/security/AccountAuthorityService.js';

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

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      deviceId?: string;
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

export async function authenticateDevice(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (typeof req.headers['x-device-token'] === 'string') {
      token = req.headers['x-device-token'].trim();
    }

    let deviceId =
      (req.headers['x-device-id'] as string) ||
      (req.body?.deviceId as string) ||
      (req.query?.['deviceId'] as string);

    if (token) {
      try {
        const decoded = verifyDeviceToken(token);
        if (decoded?.sub) {
          deviceId = decoded.sub;
        }
      } catch {
        try {
          const decoded: any = verifyJwt(token);
          if (decoded?.deviceId) {
            deviceId = decoded.deviceId;
          }
        } catch {
          // Token is neither a device JWT nor an app JWT
        }

        if (!deviceId) {
          const tokenHash = hashToken(token);
          const devRes = await pool.query('SELECT id, status FROM devices WHERE device_token_hash = $1;', [tokenHash]);
          if (devRes.rows.length > 0) {
            deviceId = devRes.rows[0].id;
          } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
            deviceId = token;
          }
        }
      }
    }

    if (!deviceId) {
      throw new UnauthorizedError('Device identification required via Bearer token, X-Device-Token, or X-Device-ID header', 'UNAUTHORIZED_DEVICE');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId);
    const devRes = isUuid
      ? await pool.query(
          'SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at, public_key, device_token_hash, max_offline_hours, last_seen_at FROM devices WHERE id = $1;',
          [deviceId]
        )
      : await pool.query(
          'SELECT id, organization_id, center_id, device_identifier, status, is_blocked, revoked_at, public_key, device_token_hash, max_offline_hours, last_seen_at FROM devices WHERE device_identifier = $1;',
          [deviceId]
        );

    if (devRes.rows.length === 0) {
      throw new UnauthorizedError(`Device ${deviceId} is not registered`, 'DEVICE_NOT_FOUND');
    }

    const device = devRes.rows[0];

    // 1. Permanent revocation check: credentials wiped, revoked_at set, or REVOKED/DECOMMISSIONED status
    // Replay of an unexpired JWT cannot restore access to a revoked device
    if (
      device.status === 'REVOKED' ||
      device.status === 'DECOMMISSIONED' ||
      device.revoked_at !== null ||
      (device.public_key === null && device.device_token_hash === null && device.status !== 'ACTIVE')
    ) {
      throw new ForbiddenError(
        `Device ${device.device_identifier} credentials have been permanently revoked. Access denied.`,
        'DEVICE_REVOKED'
      );
    }

    // 2. Administrative block check
    if (device.status === 'BLOCKED' || device.is_blocked === true) {
      throw new ForbiddenError(
        `Device ${device.device_identifier} is administratively blocked. Access denied.`,
        'DEVICE_BLOCKED'
      );
    }

    // 3. Strict active status check
    if (device.status !== 'ACTIVE') {
      throw new ForbiddenError(`Device ${device.device_identifier} status is ${device.status}. Synchronization is blocked.`, 'DEVICE_REVOKED');
    }

    // 4. Tenant ownership check
    const requestedOrg = (req.headers['x-dairy-tenant-id'] as string) || (req.headers['x-organization-id'] as string) || req.auth?.organizationId;
    if (requestedOrg && device.organization_id && requestedOrg.trim().toLowerCase() !== device.organization_id.trim().toLowerCase()) {
      throw new ForbiddenError('Cross-tenant device operation denied: Organization mismatch.', 'CROSS_TENANT_ACCESS_DENIED');
    }

    if (device.last_seen_at && device.max_offline_hours) {
      const hoursOffline = (Date.now() - new Date(device.last_seen_at).getTime()) / (1000 * 60 * 60);
      if (hoursOffline > device.max_offline_hours) {
        throw new ForbiddenError(`Device authorization has expired (${Math.round(hoursOffline)}h offline > ${device.max_offline_hours}h limit). Re-authentication required.`, 'OFFLINE_EXPIRED');
      }
    }

    req.deviceId = device.id;
    next();
  } catch (err) {
    next(err);
  }
}
