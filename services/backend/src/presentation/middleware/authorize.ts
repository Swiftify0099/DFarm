import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors/index.js';

/**
 * Authoritative DFarm Role-Permission Mapping (Default-Deny Model)
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    '*', // Full central platform authority
  ],
  PLATFORM_OPERATOR: [
    'system:monitor',
    'alerts:read',
    'alerts:acknowledge',
    'alerts:resolve',
    'hardware:read',
    'audit:read',
    'reports:read',
    'dairies:read',
    'admins:read',
    'policies:rate_read',
    'policies:fat_snf_read',
    'support:access_readonly',
  ],
  PRIMARY_DAIRY_ADMIN: [
    'dairy:manage_staff',
    'dairy:manage_config',
    'dairy:read_staff',
    'customers:read',
    'customers:approve',
    'customers:reject',
    'customers:update',
    'customers:delete',
    'rfid:manage',
    'biometrics:manage',
    'rate_charts:read',
    'rate_charts:manage',
    'sessions:manage',
    'sessions:open',
    'sessions:close',
    'sessions:active',
    'sessions:audit',
    'feed:manage',
    'feed:read',
    'feed:sell',
    'billing:manage',
    'billing:read',
    'reports:dairy_read',
    'collections:view_all',
    'collections:intake',
    'devices:manage',
    'policies:rate_read',
    'policies:fat_snf_read',
  ],
  DAIRY_OWNER: [
    'dairy:manage_staff',
    'dairy:manage_config',
    'dairy:read_staff',
    'customers:read',
    'customers:approve',
    'customers:reject',
    'customers:update',
    'customers:delete',
    'rfid:manage',
    'biometrics:manage',
    'rate_charts:read',
    'rate_charts:manage',
    'sessions:manage',
    'sessions:open',
    'sessions:close',
    'sessions:active',
    'sessions:audit',
    'feed:manage',
    'feed:read',
    'feed:sell',
    'billing:manage',
    'billing:read',
    'reports:dairy_read',
    'collections:view_all',
    'collections:intake',
    'devices:manage',
    'policies:rate_read',
    'policies:fat_snf_read',
  ],
  CENTER_MANAGER: [
    'dairy:read_staff',
    'customers:read',
    'customers:approve',
    'customers:update',
    'rfid:manage',
    'biometrics:manage',
    'rate_charts:read',
    'sessions:read',
    'sessions:open',
    'sessions:close',
    'sessions:active',
    'sessions:audit',
    'feed:read',
    'feed:sell',
    'billing:read',
    'reports:dairy_read',
    'collections:view_all',
    'collections:intake',
    'policies:rate_read',
    'policies:fat_snf_read',
  ],
  ACCOUNTANT: [
    'billing:manage',
    'billing:read',
    'reports:dairy_read',
    'feed:read',
    'feed:sell',
    'customers:read',
  ],
  REGISTRATION_OFFICER: [
    'customers:read',
    'customers:approve',
    'customers:reject',
    'customers:update',
    'rfid:manage',
    'biometrics:manage',
  ],
  DAIRY_ADMIN: [
    'dairy:read_staff',
    'customers:read',
    'customers:approve',
    'customers:update',
    'rfid:manage',
    'biometrics:manage',
    'rate_charts:read',
    'sessions:read',
    'sessions:open',
    'sessions:close',
    'sessions:active',
    'sessions:audit',
    'feed:read',
    'feed:sell',
    'billing:read',
    'reports:dairy_read',
    'collections:view_all',
    'collections:intake',
    'policies:rate_read',
    'policies:fat_snf_read',
  ],
  COLLECTION_OPERATOR: [
    'sessions:open',
    'sessions:close',
    'sessions:active',
    'customers:identify_face',
    'customers:identify_rfid',
    'collections:intake',
    'collections:view_session',
    'hardware:kiosk_read',
  ],
  SUPERVISOR: [
    'sessions:active',
    'sessions:audit',
    'customers:identify_face',
    'customers:identify_rfid',
    'customers:identify_manual',
    'collections:review_exceptions',
    'collections:view_session',
    'hardware:kiosk_read',
  ],
  FARMER_CUSTOMER: [
    'profile:view_own',
    'profile:update_bank',
    'passbook:view_own',
    'bills:view_own',
    'feed:view_own',
    'notifications:view_own',
  ],
  GUEST_FARMER: [
    'dairies:discover_nearby',
    'customers:self_register',
  ],
};

/**
 * Checks whether a given role holds the requested permission.
 */
export function hasPermission(role?: string, requiredPermission?: string): boolean {
  if (!role || !requiredPermission) return false;
  const normalizedRole = role.toUpperCase();
  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
  if (permissions.includes('*')) return true;
  if (permissions.includes(requiredPermission)) return true;

  // Wildcard match e.g. "alerts:*" matches "alerts:read"
  const [category] = requiredPermission.split(':');
  if (permissions.includes(`${category}:*`)) return true;

  return false;
}

/**
 * Granular Server-Side Permission Authorization Middleware
 */
export function authorizePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const role = req.user.role;
    const isAuthorized = requiredPermissions.some((p) => hasPermission(role, p));
    if (!isAuthorized) {
      throw new ForbiddenError(
        `Forbidden: Role '${role}' lacks required permission [${requiredPermissions.join(', ')}]`
      );
    }

    next();
  };
}

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(`Forbidden: Role '${req.user.role}' lacks permission`);
    }

    next();
  };
}

export function authorizeActor(actorType: 'STAFF' | 'CUSTOMER') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.actorType !== actorType) {
      throw new ForbiddenError(`Forbidden: Actor type '${req.user.actorType}' is not allowed`);
    }

    next();
  };
}
