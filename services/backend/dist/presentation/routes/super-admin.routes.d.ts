import { Request, Response, NextFunction } from 'express';
/**
 * Access Control Middleware for Platform Staff (Super Admin or Platform Operator)
 */
export declare function requirePlatformStaffRole(req: Request, res: Response, next: NextFunction): void;
/**
 * Access Control Middleware strictly requiring SUPER_ADMIN authority
 */
export declare function requireSuperAdminRole(req: Request, res: Response, next: NextFunction): void;
export declare const superAdminRoutes: import("express-serve-static-core").Router;
//# sourceMappingURL=super-admin.routes.d.ts.map