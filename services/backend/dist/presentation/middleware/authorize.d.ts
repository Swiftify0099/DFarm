import { Request, Response, NextFunction } from 'express';
/**
 * Authoritative DFarm Role-Permission Mapping (Default-Deny Model)
 */
export declare const ROLE_PERMISSIONS: Record<string, string[]>;
/**
 * Checks whether a given role holds the requested permission.
 */
export declare function hasPermission(role?: string, requiredPermission?: string): boolean;
/**
 * Granular Server-Side Permission Authorization Middleware
 */
export declare function authorizePermission(...requiredPermissions: string[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function authorizeRoles(...allowedRoles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function authorizeActor(actorType: 'STAFF' | 'CUSTOMER'): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=authorize.d.ts.map