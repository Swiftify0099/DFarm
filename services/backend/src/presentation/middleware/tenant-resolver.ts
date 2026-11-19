import { Request, Response, NextFunction } from 'express';
import { tenantDbManager, IDatabaseClient } from '../../infrastructure/database/TenantDatabaseManager.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../domain/errors/index.js';

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
export function requireTenantContext(options: TenantResolverOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      let targetDairyId: string | undefined;
      let accessPurpose = 'OPERATIONAL_BUSINESS_TRANSACTION';

      // 1. Check if public customer registration flow is permitted
      if (options.allowPublicRegistration && (req.body?.organizationId || req.body?.dairyId)) {
        targetDairyId = (req.body.organizationId || req.body.dairyId) as string;
        accessPurpose = 'PUBLIC_CUSTOMER_REGISTRATION';
      } else {
        // 2. Normal operational request: strictly derived from verified token claims
        const authUser = req.user;
        if (!authUser || !authUser.organizationId) {
          throw new ForbiddenError(
            'Tenant context missing: Request requires verified dairy membership token',
            'MISSING_TENANT_MEMBERSHIP'
          );
        }

        targetDairyId = authUser.organizationId;

        // 3. Prevent IDOR: Assert route params or body do not attempt cross-dairy override
        const paramDairyId = req.params.organizationId || req.params.dairyId;
        if (paramDairyId && paramDairyId !== targetDairyId) {
          throw new ForbiddenError(
            `Cross-tenant access prohibited: Token organizationId (${targetDairyId}) does not match URL parameter (${paramDairyId})`,
            'CROSS_TENANT_FORBIDDEN'
          );
        }

        const bodyDairyId = req.body?.organizationId || req.body?.dairyId;
        if (bodyDairyId && bodyDairyId !== targetDairyId) {
          throw new ForbiddenError(
            `Cross-tenant access prohibited: Token organizationId (${targetDairyId}) does not match body parameter (${bodyDairyId})`,
            'CROSS_TENANT_FORBIDDEN'
          );
        }
      }

      if (!targetDairyId) {
        throw new BadRequestError('Target dairy identifier could not be determined', 'MISSING_DAIRY_ID');
      }

      // 4. Resolve central mapping
      let mapping = tenantDbManager.getTenantMapping(targetDairyId);
      if (!mapping) {
        // Query central control plane database
        const controlDb = tenantDbManager.getControlPlaneDb();
        const res = await controlDb.query(
          'SELECT * FROM dairy_database_mappings WHERE dairy_id = $1;',
          [targetDairyId]
        );
        if (res.rows.length === 0) {
          throw new NotFoundError(`No database mapping found for dairy: ${targetDairyId}`, 'TENANT_NOT_FOUND');
        }
        const row = res.rows[0];
        mapping = {
          id: row.id,
          dairyId: row.dairy_id,
          dairyCode: row.dairy_code,
          databaseName: row.database_name,
          resourceType: row.resource_type === 'ISOLATED_TEST_INSTANCE' ? 'ISOLATED_TEST_INSTANCE' : 'PHYSICAL_DATABASE',
          connectionUriEncrypted: row.connection_uri_encrypted,
          schemaVersion: row.schema_version,
          provisioningStatus: row.provisioning_status,
          provisioningError: row.provisioning_error,
          provisionedAt: row.provisioned_at?.toISOString?.() || row.provisioned_at,
          lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at,
        };
      }

      if (mapping.provisioningStatus !== 'ACTIVE') {
        throw new ForbiddenError(
          `Dairy database is not active (status: ${mapping.provisioningStatus})`,
          'TENANT_DB_INACTIVE'
        );
      }

      // 5. Obtain bounded tenant database client
      const tenantDb = await tenantDbManager.getTenantDb(targetDairyId);

      // 6. Attach to Express Request
      req.tenantContext = {
        dairyId: targetDairyId,
        databaseName: mapping.databaseName,
        mappingId: mapping.id,
        schemaVersion: mapping.schemaVersion,
        accessPurpose,
      };
      req.tenantDb = tenantDb;

      next();
    } catch (err) {
      next(err);
    }
  };
}
