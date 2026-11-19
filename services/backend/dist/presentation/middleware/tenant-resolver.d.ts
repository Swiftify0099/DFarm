import { Request, Response, NextFunction } from 'express';
import { IDatabaseClient } from '../../infrastructure/database/TenantDatabaseManager.js';
export interface TenantContext {
    dairyId: string;
    databaseName: string;
    mappingId: string;
    schemaVersion: string;
    accessPurpose: string;
}
declare global {
    namespace Express {
        interface Request {
            tenantContext?: TenantContext;
            tenantDb?: IDatabaseClient;
        }
    }
}
export interface TenantResolverOptions {
    allowPublicRegistration?: boolean;
}
/**
 * Strict Server-Side Tenant Context Resolver Middleware
 *
 * Rules:
 * 1. Derives Dairy ID strictly from cryptographically verified authenticated token (req.user.organizationId).
 * 2. Rejects arbitrary client-supplied headers (x-tenant-id, x-dev-*).
 * 3. Rejects URL parameter or body mismatches if a user tries to access a different dairy's data.
 * 4. Resolves the persistent tenant database mapping from the central control plane.
 * 5. Attaches the bounded tenant database client (req.tenantDb) and context (req.tenantContext).
 * 6. Fails closed with 403 Forbidden or 404 Not Found if context cannot be verified.
 */
export declare function requireTenantContext(options?: TenantResolverOptions): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=tenant-resolver.d.ts.map