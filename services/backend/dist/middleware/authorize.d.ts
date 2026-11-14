import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '@dfarm/shared-types';
export declare function requireAuthenticated(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(allowedRoles: UserRole[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireOrganizationAccess(getOrgId: (req: Request) => string | undefined): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireCenterAccess(getCenterId: (req: Request) => string | undefined): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireCustomerOwnership(getCustomerId: (req: Request) => string, allowedStaffRoles?: UserRole[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=authorize.d.ts.map