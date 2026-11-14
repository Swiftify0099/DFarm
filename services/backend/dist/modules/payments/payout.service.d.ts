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
}
export declare class PayoutService {
    createPayout(params: CreatePayoutParams, auth: AuthContext): Promise<any>;
    approvePayout(payoutId: string, auth: AuthContext, comments?: string | null): Promise<any>;
    submitPayout(payoutId: string, auth: AuthContext, paymentReference?: string | null): Promise<any>;
    confirmPayout(payoutId: string, auth: AuthContext, paymentReference: string, settledAt?: string, _notes?: string | null): Promise<any>;
    failPayout(payoutId: string, auth: AuthContext, failureReason: string): Promise<any>;
    reversePayout(payoutId: string, auth: AuthContext, reason: string, idempotencyKey: string): Promise<any>;
    getPayoutById(payoutId: string, auth: AuthContext): Promise<{
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
    getPayoutReceipt(payoutId: string, auth: AuthContext): Promise<import("@dfarm/shared-types").FormattedPaymentReceipt>;
    getCustomerPayouts(customerId: string, auth: AuthContext, filters?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        customerId: string;
        totalCount: number;
        payouts: any[];
    }>;
    getCustomerPaymentSummary(customerId: string, auth: AuthContext): Promise<{
        customerId: string;
        currentBalance: number;
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