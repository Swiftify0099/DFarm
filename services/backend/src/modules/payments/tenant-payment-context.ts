// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// STRICT TENANT PAYMENT CONTEXT & SHARED RECONCILIATION HELPERS (DF-022 / DF-024)
// ==============================================================================

import type { Request } from 'express';
import type pg from 'pg';
import {
  tenantDbManager,
  type IDatabaseClient,
} from '../../infrastructure/database/TenantDatabaseManager.js';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/errors/app-error.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { NotificationService } from '../notifications/services/notification.service.js';
import { NotificationEventType } from '@dfarm/shared-types';
import { logger } from '../../shared/logger/index.js';

export interface DeferredNotification {
  organizationId: string;
  centerId?: string;
  customerId: string;
  eventType: NotificationEventType;
  eventId: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export interface BatchAggregateStats {
  total: number;
  successfulCount: number;
  successfulAmount: number;
  failedCount: number;
  failedAmount: number;
  reversedCount: number;
  unknownCount: number;
  pendingCount: number;
  pendingAmount: number;
  batchStatus: string;
  reconciliationStatus: string;
}

/**
 * Masks sensitive bank account digits while keeping the trailing 4 characters
 * where available so logs, responses, and errors never expose full numbers.
 */
export function maskAccountNumber(account: string | null | undefined): string {
  const digits = String(account || '').replace(/[^0-9]/g, '');
  if (digits.length >= 4) {
    return `XXXX-XXXX-${digits.slice(-4)}`;
  }
  return 'XXXX';
}

/**
 * Resolves the authoritative operational dairy organization ID for payments,
 * Union Bank submissions, status inquiries, and reconciliation.
 *
 * Fail-closed rules:
 * - Rejects unauthenticated callers without organization context.
 * - Rejects platform federation ID as an operational financial target.
 * - Regular dairy staff always operate strictly within `auth.organizationId`
 *   and reject contradicting target identifiers.
 * - Platform `SUPER_ADMIN` must explicitly specify a non-platform target dairy.
 */
export function resolveOperationalOrganizationId(
  auth: AuthContext,
  targetOrganizationId?: string | null,
  crossOrgErrorCode: string = 'CROSS_ORG_ACCESS_DENIED'
): string {
  if (!auth?.userId || !auth?.organizationId) {
    throw new UnauthorizedError('Authenticated organization context is required');
  }

  const explicitTarget =
    typeof targetOrganizationId === 'string' && targetOrganizationId.trim().length > 0
      ? targetOrganizationId.trim()
      : null;

  const isPlatformAdmin =
    auth.role === 'SUPER_ADMIN' &&
    tenantDbManager.isPlatformFederationDairy(auth.organizationId);

  if (isPlatformAdmin) {
    if (!explicitTarget) {
      throw new BadRequestError(
        'SUPER_ADMIN operating from platform federation context must supply an explicit targetOrganizationId',
        'SUPER_ADMIN_TARGET_ORG_REQUIRED'
      );
    }
    if (tenantDbManager.isPlatformFederationDairy(explicitTarget)) {
      throw new ForbiddenError(
        'Platform federation database cannot be targeted for dairy financial operations',
        'CONTROL_PLANE_TARGET_FORBIDDEN'
      );
    }
    return explicitTarget;
  }

  if (tenantDbManager.isPlatformFederationDairy(auth.organizationId)) {
    throw new ForbiddenError(
      'Platform federation context is not valid for dairy financial operations',
      'CONTROL_PLANE_TARGET_FORBIDDEN'
    );
  }

  if (explicitTarget && explicitTarget !== auth.organizationId) {
    throw new ForbiddenError(
      'Supplied target organization contradicts authenticated tenant identity',
      crossOrgErrorCode
    );
  }

  return auth.organizationId;
}

/**
 * Extracts and consistency-checks an optional explicit target organization ID
 * from request body, query params, or `x-organization-id` header.
 */
export function extractTargetOrganizationId(
  req: Request,
  conflictErrorCode: string = 'CROSS_ORG_ACCESS_DENIED'
): string | undefined {
  const rawBodyOrg =
    typeof req.body?.targetOrganizationId === 'string' && req.body.targetOrganizationId.trim().length > 0
      ? req.body.targetOrganizationId.trim()
      : typeof req.body?.organizationId === 'string' && req.body.organizationId.trim().length > 0
        ? req.body.organizationId.trim()
        : undefined;
  const rawQueryOrg =
    typeof req.query?.['targetOrganizationId'] === 'string' && req.query['targetOrganizationId'].trim().length > 0
      ? req.query['targetOrganizationId'].trim()
      : typeof req.query?.['organizationId'] === 'string' && req.query['organizationId'].trim().length > 0
        ? req.query['organizationId'].trim()
        : undefined;
  const rawHeaderOrg =
    typeof req.headers?.['x-organization-id'] === 'string' && req.headers['x-organization-id'].trim().length > 0
      ? req.headers['x-organization-id'].trim()
      : undefined;

  if (rawBodyOrg && rawQueryOrg && rawBodyOrg !== rawQueryOrg) {
    throw new ForbiddenError(
      'Conflicting target organization identifiers supplied',
      conflictErrorCode
    );
  }
  const resolved = rawBodyOrg || rawQueryOrg;
  if (resolved && rawHeaderOrg && resolved !== rawHeaderOrg) {
    throw new ForbiddenError(
      'Header organization identifier contradicts target organization',
      conflictErrorCode
    );
  }
  return resolved || rawHeaderOrg;
}

/**
 * Resolves the strict operational tenant database handle for a dairy organization.
 * Rejects platform-federation IDs and bypasses cache + permissive fallback.
 */
export async function getStrictPaymentTenantDb(organizationId: string): Promise<IDatabaseClient> {
  if (!organizationId || !organizationId.trim()) {
    throw new UnauthorizedError('Operational organization identifier is required');
  }
  const cleanOrgId = organizationId.trim();
  if (tenantDbManager.isPlatformFederationDairy(cleanOrgId)) {
    throw new ForbiddenError(
      'Platform federation database cannot be used for operational financial writes',
      'CONTROL_PLANE_TARGET_FORBIDDEN'
    );
  }
  return tenantDbManager.getStrictTenantDb(cleanOrgId, {
    bypassCache: true,
    strictOperational: true,
  });
}

/**
 * Flushes deferred notifications ONLY after the outer PostgreSQL transaction commits.
 */
export async function flushDeferredNotifications(notifications: DeferredNotification[]): Promise<void> {
  if (!notifications || notifications.length === 0) {
    return;
  }
  const results = await Promise.allSettled(
    notifications.map((n) => NotificationService.enqueueNotification(n))
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error(
        { error: r.reason?.message || String(r.reason) },
        'Failed to enqueue post-commit payment notification'
      );
    }
  }
}

/**
 * Recomputes authoritative batch counts, amounts, status, and reconciliation status
 * from canonical `payment_batch_items` rows inside the active tenant transaction.
 */
export async function recomputeBatchAggregatesInTransaction(
  client: pg.PoolClient,
  batchId: string,
  organizationId: string
): Promise<BatchAggregateStats> {
  const statsRes = await client.query<{
    total: number;
    successful_count: number;
    successful_amount: string | number;
    failed_count: number;
    failed_amount: string | number;
    reversed_count: number;
    unknown_count: number;
    pending_count: number;
    pending_amount: string | number;
  }>(
    `SELECT
       COUNT(id)::int AS total,
       COUNT(CASE WHEN status IN ('PAID', 'SETTLED') THEN 1 END)::int AS successful_count,
       COALESCE(SUM(CASE WHEN status IN ('PAID', 'SETTLED') THEN amount ELSE 0 END), 0)::numeric(12,2) AS successful_amount,
       COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int AS failed_count,
       COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0)::numeric(12,2) AS failed_amount,
       COUNT(CASE WHEN status = 'REVERSED' THEN 1 END)::int AS reversed_count,
       COUNT(CASE WHEN status = 'UNKNOWN' THEN 1 END)::int AS unknown_count,
       COUNT(CASE WHEN status IN ('PENDING', 'CALCULATED', 'APPROVED', 'SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING') THEN 1 END)::int AS pending_count,
       COALESCE(SUM(CASE WHEN status IN ('PENDING', 'CALCULATED', 'APPROVED', 'SUBMITTED', 'SUBMITTED_TO_BANK', 'PROCESSING') THEN amount ELSE 0 END), 0)::numeric(12,2) AS pending_amount
     FROM payment_batch_items
     WHERE batch_id = $1;`,
    [batchId]
  );

  const stats = statsRes.rows[0]!;
  const total = Number(stats.total);
  const success = Number(stats.successful_count);
  const failed = Number(stats.failed_count);
  const reversed = Number(stats.reversed_count);
  const unknown = Number(stats.unknown_count);
  const pending = Number(stats.pending_count);

  let batchStatus = 'PROCESSING';
  let reconStatus = 'PARTIALLY_RECONCILED';

  if (total === 0) {
    batchStatus = 'FAILED';
    reconStatus = 'FULLY_RECONCILED';
  } else if (success === total) {
    batchStatus = 'PAID';
    reconStatus = 'FULLY_RECONCILED';
  } else if (failed === total) {
    batchStatus = 'FAILED';
    reconStatus = 'FULLY_RECONCILED';
  } else if (reversed === total) {
    batchStatus = 'RECONCILED';
    reconStatus = 'FULLY_RECONCILED';
  } else if (unknown > 0) {
    batchStatus = 'UNKNOWN';
    reconStatus = 'PARTIALLY_RECONCILED';
  } else if (pending === 0 && (success > 0 || reversed > 0 || failed > 0)) {
    batchStatus = success > 0 ? 'PARTIALLY_PAID' : 'RECONCILED';
    reconStatus = 'FULLY_RECONCILED';
  }

  await client.query(
    `UPDATE payment_batches
     SET status = $1,
         reconciliation_status = $2,
         successful_count = $3,
         successful_amount = $4,
         failed_count = $5,
         failed_amount = $6,
         pending_count = $7,
         pending_amount = $8,
         completed_at = CASE WHEN $7 = 0 AND $9 = 0 THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $10
       AND organization_id = $11;`,
    [
      batchStatus,
      reconStatus,
      success,
      stats.successful_amount,
      failed,
      stats.failed_amount,
      pending,
      stats.pending_amount,
      unknown,
      batchId,
      organizationId,
    ]
  );

  return {
    total,
    successfulCount: success,
    successfulAmount: Number(stats.successful_amount),
    failedCount: failed,
    failedAmount: Number(stats.failed_amount),
    reversedCount: reversed,
    unknownCount: unknown,
    pendingCount: pending,
    pendingAmount: Number(stats.pending_amount),
    batchStatus,
    reconciliationStatus: reconStatus,
  };
}
