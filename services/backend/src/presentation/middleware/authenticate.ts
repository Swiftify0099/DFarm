import { Request, Response, NextFunction } from 'express';
import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { UnauthorizedError, ForbiddenError, DomainError } from '../../domain/errors/index.js';
import { sseTicketService } from '../../infrastructure/security/SseTicketService.js';
import { tokenRevocationService } from '../../infrastructure/security/TokenRevocationService.js';
import { accountAuthorityService } from '../../infrastructure/security/AccountAuthorityService.js';

const tokenService = new HmacJwtTokenService();

export interface AuthenticatedUser {
  userId: string;
  organizationId?: string;
  centerId?: string;
  globalCustomerId?: string;
  role: string;
  actorType: 'STAFF' | 'CUSTOMER';
  fullName?: string;
  phoneNumber?: string;
  deviceId?: string;
  tokenType?: 'access' | 'refresh';
  jti?: string;
  exp?: number;
  centerIds?: string[];
  registrationStatus?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

async function resolveVerifiedPresentationUser(
  token: string
): Promise<AuthenticatedUser> {
  const claims = tokenService.verifyToken(token);
  if (claims.tokenType === 'refresh') {
    throw new UnauthorizedError('Refresh tokens cannot be used as access tokens', 'INVALID_TOKEN_TYPE');
  }
  if (await tokenRevocationService.isRevoked(token, claims.jti)) {
    throw new UnauthorizedError('Authentication token has been revoked', 'TOKEN_REVOKED');
  }

  if (claims.actorType === 'STAFF') {
    const staff = await accountAuthorityService.verifyStaff({
      userId: claims.userId,
      claimedOrganizationId: claims.organizationId,
      loadCenterAssignments: true,
    });
    if (!staff) {
      throw new UnauthorizedError('Staff account no longer exists', 'USER_NOT_FOUND');
    }
    const isPlatformStaff = staff.role === 'SUPER_ADMIN' || staff.role === 'PLATFORM_OPERATOR';
    return {
      ...claims,
      userId: staff.userId,
      organizationId: isPlatformStaff ? claims.organizationId : (staff.organizationId || claims.organizationId),
      centerId: claims.centerId || staff.primaryCenterId,
      centerIds: staff.centerIds,
      role: staff.role,
      actorType: 'STAFF',
      fullName: staff.fullName || claims.fullName,
      phoneNumber: staff.phoneNumber || claims.phoneNumber,
    };
  }

  const customer = await accountAuthorityService.verifyCustomer({
    userId: claims.userId,
    claimedRole: claims.role,
    organizationId: claims.organizationId,
    globalCustomerId: claims.globalCustomerId,
    allowGuestFarmer: true,
    strictActiveOnly: false,
  });

  if (!customer) {
    throw new UnauthorizedError('Customer account or identity no longer exists', 'USER_NOT_FOUND');
  }

  return {
    ...claims,
    userId: customer.userId,
    organizationId: customer.organizationId || claims.organizationId,
    centerId: customer.centerId || claims.centerId,
    globalCustomerId: customer.globalCustomerId || claims.globalCustomerId,
    role: customer.role,
    actorType: 'CUSTOMER',
    fullName: customer.fullName || claims.fullName,
    phoneNumber: customer.phoneNumber || claims.phoneNumber,
    registrationStatus: customer.registrationStatus,
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // Never accept query token on standard API endpoints
    const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);

    if (!authHeader) {
      throw new UnauthorizedError('Authorization token required');
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    req.user = await resolveVerifiedPresentationUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Never accept query token on standard API endpoints
  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    req.user = await resolveVerifiedPresentationUser(token);
  } catch (err: any) {
    // Fail closed if the authoritative authentication DB is unavailable
    if (err instanceof DomainError && err.statusCode === 503) {
      return next(err);
    }
    // Ignore invalid/expired token in optional auth only
  }
  next();
}

/**
 * Dedicated authentication middleware for SSE streaming endpoints (/dairy-admin/events).
 * Rejects raw access tokens in URL query strings (400/401).
 */
export async function authenticateSseStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.query.token) {
    res.status(400).json({
      success: false,
      errorCode: 'EXPOSED_QUERY_TOKEN_FORBIDDEN',
      error: 'Long-lived access tokens are strictly forbidden in URL query parameters. Use an SSE ticket or Authorization header.',
    });
    return;
  }

  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);
  const ticketQuery = (req.query.ticket as string) || (req.headers['x-sse-ticket'] as string);

  let user: AuthenticatedUser | null = null;

  try {
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
      user = await resolveVerifiedPresentationUser(token);
    } else if (ticketQuery) {
      user = await sseTicketService.verifyAndConsumeTicket(ticketQuery);
    } else {
      throw new UnauthorizedError('Authentication token or SSE ticket required');
    }
  } catch (err: any) {
    if (err instanceof DomainError && err.statusCode === 503) {
      res.status(503).json({
        success: false,
        errorCode: err.code || 'AUTH_DB_UNAVAILABLE',
        error: err.message,
      });
      return;
    }
    if (err instanceof ForbiddenError) {
      res.status(403).json({ success: false, errorCode: err.code || 'FORBIDDEN', error: err.message });
      return;
    }
    res.status(401).json({ success: false, errorCode: err?.code || 'UNAUTHORIZED', error: err?.message || 'Unauthorized' });
    return;
  }

  const allowedAdminRoles = [
    'PRIMARY_DAIRY_ADMIN',
    'DAIRY_ADMIN',
    'SUPER_ADMIN',
    'DAIRY_OWNER',
    'BRANCH_MANAGER',
    'CENTER_MANAGER',
  ];

  if (!allowedAdminRoles.includes(user.role)) {
    res.status(403).json({
      success: false,
      errorCode: 'ROLE_UNAUTHORIZED',
      error: `Role '${user.role}' is not authorized for dairy admin SSE streaming.`,
    });
    return;
  }

  req.user = user;
  next();
}
