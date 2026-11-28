import type { Request } from 'express';
import type pg from 'pg';
import { type IDatabaseClient } from '../../infrastructure/database/TenantDatabaseManager.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { NotificationEventType } from '@dfarm/shared-types';
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
export declare function maskAccountNumber(account: string | null | undefined): string;
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
export declare function resolveOperationalOrganizationId(auth: AuthContext, targetOrganizationId?: string | null, crossOrgErrorCode?: string): string;
/**
 * Extracts and consistency-checks an optional explicit target organization ID
 * from request body, query params, or `x-organization-id` header.
 */
export declare function extractTargetOrganizationId(req: Request, conflictErrorCode?: string): string | undefined;
/**
 * Resolves the strict operational tenant database handle for a dairy organization.
 * Rejects platform-federation IDs and bypasses cache + permissive fallback.
 */
export declare function getStrictPaymentTenantDb(organizationId: string): Promise<IDatabaseClient>;
/**
 * Flushes deferred notifications ONLY after the outer PostgreSQL transaction commits.
 */
export declare function flushDeferredNotifications(notifications: DeferredNotification[]): Promise<void>;
/**
 * Recomputes authoritative batch counts, amounts, status, and reconciliation status
 * from canonical `payment_batch_items` rows inside the active tenant transaction.
 */
export declare function recomputeBatchAggregatesInTransaction(client: pg.PoolClient, batchId: string, organizationId: string): Promise<BatchAggregateStats>;
//# sourceMappingURL=tenant-payment-context.d.ts.map