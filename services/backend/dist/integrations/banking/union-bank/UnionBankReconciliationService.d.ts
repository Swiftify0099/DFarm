import type { AuthContext } from '../../../middleware/authenticate.js';
import type { UnionBankReconciliationItemResult } from './types.js';
export interface ReconciliationItemResult {
    itemId: string;
    customerReference: string;
    farmerCode: string;
    expectedAmount: number;
    bankAmount: number;
    bankUtr?: string;
    status: string;
    message: string;
    isIdempotentReplay: boolean;
}
export interface ReconciliationException {
    reference: string;
    reason: string;
}
export interface ReconciliationResult {
    batchId: string;
    batchStatus: string;
    reconciliationStatus: string;
    totalBeneficiaries: number;
    paidCount: number;
    successfulCount: number;
    failedCount: number;
    reversedCount: number;
    unknownCount: number;
    processedItems: ReconciliationItemResult[];
    exceptions: ReconciliationException[];
}
/**
 * Resolves the authoritative target organization for Union Bank reconciliation.
 *
 * - Regular dairy staff always reconcile within `auth.organizationId` and reject
 *   any contradicting body/query/header target organization identifier.
 * - Platform `SUPER_ADMIN` must provide an explicit non-platform `targetOrganizationId`
 *   (no scanning across tenant pools and no control-plane financial fallback).
 */
export declare function resolveReconciliationTargetOrganization(auth: AuthContext, targetOrganizationId?: string | null): string;
export declare class UnionBankReconciliationService {
    /**
     * Reconciles a payment batch against Union Bank Reverse MIS response data inside
     * one authoritative physical tenant PostgreSQL database and one shared batch-level
     * transaction.
     */
    static reconcileBatchWithBankData(batchId: string, bankResponseContentOrItems: string | UnionBankReconciliationItemResult[], auth: AuthContext, targetOrganizationId?: string | null): Promise<ReconciliationResult>;
}
//# sourceMappingURL=UnionBankReconciliationService.d.ts.map