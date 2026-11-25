import { UserRole } from '@dfarm/shared-types';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/app-error.js';
export function requireAuthenticated(req, _res, next) {
    if (!req.auth) {
        return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
    }
    next();
}
export function requireRole(allowedRoles) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
        }
        if (req.auth.role === UserRole.SUPER_ADMIN) {
            return next();
        }
        const effectiveRole = (req.auth.role === 'PRIMARY_DAIRY_ADMIN' ? UserRole.DAIRY_ADMIN : req.auth.role);
        if (!allowedRoles.includes(req.auth.role) && !allowedRoles.includes(effectiveRole)) {
            return next(new ForbiddenError(`Actor with role '${req.auth.role}' is not authorized to perform this operation. Required: [${allowedRoles.join(', ')}]`, 'FORBIDDEN'));
        }
        next();
    };
}
export function requireOrganizationAccess(getOrgId) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
        }
        if (req.auth.role === UserRole.SUPER_ADMIN) {
            return next();
        }
        const targetOrgId = getOrgId(req);
        if (!targetOrgId) {
            return next();
        }
        if (req.auth.organizationId !== targetOrgId) {
            return next(new ForbiddenError('Cross-organization access is strictly prohibited', 'CROSS_ORGANIZATION_ACCESS_DENIED'));
        }
        next();
    };
}
export function requireCenterAccess(getCenterId) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
        }
        if (req.auth.role === UserRole.SUPER_ADMIN || req.auth.role === UserRole.DAIRY_OWNER) {
            return next();
        }
        const targetCenterId = getCenterId(req);
        if (!targetCenterId) {
            return next();
        }
        if (!req.auth.centerIds.includes(targetCenterId)) {
            return next(new ForbiddenError(`Actor does not have assigned access to center '${targetCenterId}'`, 'CENTER_ACCESS_DENIED'));
        }
        next();
    };
}
export function requireCustomerOwnership(getCustomerId, allowedStaffRoles) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
        }
        // Staff roles check with least-privilege enforcement
        if (req.auth.actorType === 'STAFF') {
            if (allowedStaffRoles && !allowedStaffRoles.includes(req.auth.role)) {
                return next(new ForbiddenError(`Staff role '${req.auth.role}' is not authorized to access customer financial records`, 'STAFF_FINANCIAL_ACCESS_DENIED'));
            }
            return next();
        }
        const targetCustomerId = getCustomerId(req);
        if (req.auth.userId !== targetCustomerId) {
            return next(new ForbiddenError('Customer accounts may only access their own profile and records', 'CUSTOMER_ISOLATION_VIOLATION'));
        }
        next();
    };
}
//# sourceMappingURL=authorize.js.map