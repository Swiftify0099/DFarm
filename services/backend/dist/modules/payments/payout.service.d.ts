import type pg from 'pg';
import type { AuthContext } from '../../middleware/authenticate.js';
export interface CreatePayoutParams {
    centerId: string;
    customerId: string;
    amount: number;
    currency?: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    sourceTransactionType?: string;
    sourceTransactionId?: string | null;
    idempotencyKey: string;
    notes?: string | null;
    allowOverpaymentAdvance?: boolean;
    targetOrganizationId?: string;
}
export declare class PayoutService {
    createPayout(params: CreatePayoutParams, auth: AuthContext, targetOrganizationId?: string | null): Promise<any>;
    approvePayout(payoutId: string, auth: AuthContext, comments?: string | null, targetOrganizationId?: string | null): Promise<any>;
    submitPayout(payoutId: string, auth: AuthContext, paymentReference?: string | null, targetOrganizationId?: string | null): Promise<any>;
    confirmPayout(payoutId: string, auth: AuthContext, paymentReference: string, settledAt?: string, _notes?: string | null, targetOrganizationId?: string | null): Promise<any>;
    failPayout(payoutId: string, auth: AuthContext, failureReason: string, targetOrganizationId?: string | null): Promise<any>;
    /**
     * Confirms (settles) a payout inside an existing tenant transaction.
     * Uses public.settle_customer_payout() through the supplied transaction client.
     * Falls back to direct SQL if the RPC is not yet deployed.
     *
     * @param client           - Existing tenant transaction client (from withTransaction)
     * @param payoutId         - UUID of the payout to settle
     * @param auth             - Authenticated caller context
     * @param organizationId   - Authoritative tenant organization ID
     * @param paymentReference - Bank UTR / payment reference
     * @param settledAt        - Settlement timestamp
     */
    confirmPayoutInTransaction(client: pg.PoolClient, payoutId: string, auth: AuthContext, organizationId: string, paymentReference: string, settledAt: Date): Promise<any>;
    /**
     * Fallback settlement when settle_customer_payout RPC is unavailable.
     * Executes all financial writes through the caller's transaction client.
     * Never uses global query().
     */
    private executeSettlePayoutInTransaction;
    /**
     * Marks a payout as FAILED inside an existing tenant transaction.
     * Uses public.fail_customer_payout() through the supplied transaction client.
     * Never debits the farmer ledger.
     *
     * @param client         - Existing tenant transaction client
     * @param payoutId       - UUID of the payout to fail
     * @param auth           - Authenticated caller context
     * @param organizationId - Authoritative tenant organization ID
     * @param failureReason  - Documented reason for failure
     */
    failPayoutInTransaction(client: pg.PoolClient, payoutId: string, auth: AuthContext, organizationId: string, failureReason: string): Promise<any>;
    /**
     * Reverses a SETTLED payout inside an existing tenant transaction.
     * Uses public.reverse_customer_payout() through the supplied transaction client.
     * Credits the farmer ledger exactly once using the deterministic idempotency key.
     *
     * @param client                 - Existing tenant transaction client
     * @param payoutId               - UUID of the SETTLED payout to reverse
     * @param auth                   - Authenticated caller context
     * @param organizationId         - Authoritative tenant organization ID
     * @param reason                 - Reversal reason
     * @param reversalIdempotencyKey - Deterministic key: REV-{orgId}-{payoutId}-{utr}
     */
    reversePayoutInTransaction(client: pg.PoolClient, payoutId: string, auth: AuthContext, organizationId: string, reason: string, reversalIdempotencyKey: string): Promise<any>;
    reversePayout(payoutId: string, auth: AuthContext, reason: string, idempotencyKey: string, targetOrganizationId?: string | null): Promise<any>;
    getPayoutById(payoutId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        id: any;
        organizationId: any;
        organizationName: any;
        centerId: any;
        centerName: any;
        customerId: any;
        customerName: any;
        farmerCode: any;
        batchId: any;
        direction: any;
        amount: number;
        currency: any;
        paymentMethod: any;
        status: any;
        referenceNumber: any;
        bankAccountMask: any;
        recipientName: any;
        notes: any;
        createdBy: any;
        approvedBy: any;
        approvedAt: any;
        submittedAt: any;
        settledAt: any;
        failedAt: any;
        failureReason: any;
        ledgerTransactionId: any;
        createdAt: any;
    }>;
    getPayoutReceipt(payoutId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<import("@dfarm/shared-types").FormattedPaymentReceipt>;
    getCustomerPayouts(customerId: string, auth: AuthContext, filters?: {
        limit?: number;
        offset?: number;
    }, targetOrganizationId?: string | null): Promise<{
        customerId: string;
        totalCount: number;
        payouts: any[];
    }>;
    getCustomerPaymentSummary(customerId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        customerId: string;
        currentBalance: number;
        currentPayableBalance: number;
        eligiblePayableAmount: number;
        outstandingCustomerReceivable: number;
        currency: any;
        totalSettledPayoutsAmount: number;
        settledPayoutsCount: number;
        totalSettledReceiptsAmount: number;
        settledReceiptsCount: number;
        pendingPayoutsAmount: number;
        pendingPayoutsCount: number;
    }>;
}
export declare const payoutService: PayoutService;
//# sourceMappingURL=payout.service.d.ts.map