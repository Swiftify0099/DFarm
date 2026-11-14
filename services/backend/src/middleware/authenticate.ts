import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRole } from '@dfarm/shared-types';
import { getAdminSupabaseClient, createUserSupabaseClient } from '../config/supabase.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/app-error.js';
import { verifyJwt } from '../jwt.js';
import { pool } from '../config/db.js';
import { hashToken, verifyDeviceToken } from '../security.js';

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
      // Local verification failed, check Supabase Auth
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

    // 4. Resolve internal application identity from the database
    // Check 1: Internal Staff User (users table)
    let staffUser: any = null;
    try {
      const { data, error: staffError } = await adminClient
        .from('users')
        .select('id, organization_id, username, full_name, email, phone_number, role, status')
        .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id}`)
        .maybeSingle();

      if (!staffError) {
        staffUser = data;
      }
    } catch {
      // Database unavailable, fallback to verified claims if present
    }

    if (!staffUser && decodedToken && decodedToken['role'] && decodedToken['organizationId']) {
      const isCustomerRole = decodedToken['role'] === UserRole.FARMER_CUSTOMER || decodedToken['actorType'] === 'CUSTOMER';
      req.auth = {
        authUser: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
        },
        actorType: isCustomerRole ? 'CUSTOMER' : 'STAFF',
        userId: authUser.id,
        organizationId: decodedToken['organizationId'] as string,
        role: decodedToken['role'] as UserRole,
        centerIds: (decodedToken['centerIds'] as string[]) || [decodedToken['centerId'] as string || 'default-center'],
        primaryCenterId: decodedToken['centerId'] as string,
        centerId: decodedToken['centerId'] as string,
        customerProfile: isCustomerRole
          ? {
              customerId: authUser.id,
              farmerCode: (decodedToken['farmerCode'] as string) || '',
            }
          : undefined,
        token,
        userSupabaseClient: adminClient,
      };
      next();
      return;
    }

    if (staffUser) {
      if (staffUser.status !== 'ACTIVE') {
        throw new ForbiddenError(
          `Staff account status is ${staffUser.status}. Access denied.`,
          'ACCOUNT_SUSPENDED'
        );
      }

      // Fetch user's assigned centers
      const { data: assignments, error: assignError } = await adminClient
        .from('user_center_assignments')
        .select('center_id, is_primary')
        .eq('user_id', staffUser.id);

      if (assignError) {
        throw assignError;
      }

      const centerIds = (assignments || []).map(a => a.center_id as string);
      const primaryAssignment = (assignments || []).find(a => a.is_primary);
      const primaryCenterId = primaryAssignment ? (primaryAssignment.center_id as string) : centerIds[0];

      req.auth = {
        authUser: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
        },
        actorType: 'STAFF',
        userId: staffUser.id,
        organizationId: staffUser.organization_id,
        role: staffUser.role as UserRole,
        centerIds,
        primaryCenterId,
        centerId: primaryCenterId || centerIds[0],
        token,
        userSupabaseClient: createUserSupabaseClient(token),
      };

      return next();
    }

    // Check 2: Customer Identity (customers table)
    const { data: customerUser, error: custError } = await adminClient
      .from('customers')
      .select('id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, is_deleted')
      .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id}`)
      .maybeSingle();

    if (custError) {
      throw custError;
    }

    if (customerUser) {
      if (customerUser.is_deleted) {
        throw new ForbiddenError('Customer account has been soft-deleted', 'ACCOUNT_DELETED');
      }

      if (customerUser.status === 'SUSPENDED') {
        throw new ForbiddenError('Customer account is suspended', 'ACCOUNT_SUSPENDED');
      }

      req.auth = {
        authUser: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
        },
        actorType: 'CUSTOMER',
        userId: customerUser.id,
        organizationId: customerUser.organization_id,
        role: UserRole.FARMER_CUSTOMER,
        centerIds: [customerUser.primary_center_id],
        primaryCenterId: customerUser.primary_center_id,
        customerProfile: {
          customerId: customerUser.id,
          farmerCode: customerUser.farmer_code,
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

    let deviceId = (req.headers['x-device-id'] as string) || (req.body?.deviceId as string);

    if (token) {
      try {
        const decoded = verifyDeviceToken(token);
        if (decoded?.sub) {
          deviceId = decoded.sub;
        }
      } catch {
        // Not a signed JWT, check if token hash exists in DB
        const tokenHash = hashToken(token);
        const devRes = await pool.query('SELECT id, status FROM devices WHERE device_token_hash = $1;', [tokenHash]);
        if (devRes.rows.length > 0) {
          deviceId = devRes.rows[0].id;
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
          deviceId = token;
        }
      }
    }

    if (!deviceId) {
      throw new UnauthorizedError('Device identification required via Bearer token, X-Device-Token, or X-Device-ID header', 'UNAUTHORIZED_DEVICE');
    }

    const devRes = await pool.query(
      'SELECT id, organization_id, center_id, device_identifier, status, max_offline_hours, last_seen_at FROM devices WHERE id = $1;',
      [deviceId]
    );

    if (devRes.rows.length === 0) {
      throw new UnauthorizedError(`Device ${deviceId} is not registered`, 'DEVICE_NOT_FOUND');
    }

    const device = devRes.rows[0];

    if (device.status !== 'ACTIVE') {
      throw new ForbiddenError(`Device ${device.device_identifier} status is ${device.status}. Synchronization is blocked.`, 'DEVICE_REVOKED');
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
