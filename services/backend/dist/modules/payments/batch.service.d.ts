import type { AuthContext } from '../../middleware/authenticate.js';
export interface CreateBatchParams {
    centerId?: string | null;
    billingCycleId?: string | null;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
    paymentMethod?: string;
    customerIds?: string[];
    payoutIds?: string[];
    idempotencyKey: string;
}
export interface ReconcileBatchItemInput {
    itemId: string;
    status: 'SETTLED' | 'FAILED';
    beneficiaryReference?: string | null;
    failureReason?: string | null;
}
export declare class BatchService {
    createBatch(params: CreateBatchParams, auth: AuthContext): Promise<{
        batchId: any;
        batchNumber: any;
        status: any;
        totalBeneficiaries: any;
        totalAmount: number;
        isIdempotentReplay: boolean;
        currency?: undefined;
        beneficiaries?: undefined;
        createdAt?: undefined;
    } | {
        batchId: `${string}-${string}-${string}-${string}-${string}`;
        batchNumber: string;
        status: string;
        totalBeneficiaries: number;
        totalAmount: number;
        currency: string;
        beneficiaries: any[];
        isIdempotentReplay: boolean;
        createdAt: string;
    }>;
    approveBatch(batchId: string, auth: AuthContext): Promise<{
        batchId: string;
        status: string;
        approvedBy: string;
        approvedAt: string;
    }>;
    submitBatch(batchId: string, _auth: AuthContext): Promise<{
        batchId: string;
        status: string;
        submittedAt: string;
        ledgerEffectApplied: boolean;
    }>;
    reconcileBatch(batchId: string, results: ReconcileBatchItemInput[], auth: AuthContext): Promise<{
        batchId: string;
        batchStatus: string;
        reconciliationStatus: string;
        totalBeneficiaries: any;
        successfulCount: any;
        failedCount: any;
        processedInCall: number;
        items: any[];
    }>;
    getBatchById(batchId: string, _auth: AuthContext): Promise<{
        id: any;
        organizationId: any;
        centerId: any;
        batchNumber: any;
        billingCycleId: any;
        billingPeriodStart: string | null;
        billingPeriodEnd: string | null;
        paymentMethod: any;
        status: any;
        totalBeneficiaries: any;
        totalAmount: number;
        successfulCount: any;
        successfulAmount: number;
        failedCount: any;
        failedAmount: number;
        pendingCount: any;
        pendingAmount: number;
        reconciliationStatus: any;
        createdAt: any;
        items: {
            id: any;
            payoutId: any;
            customerId: any;
            customerName: any;
            farmerCode: any;
            amount: number;
            currency: any;
            bankAccountMask: any;
            bankIfsc: any;
            status: any;
            beneficiaryReference: any;
            failureReason: any;
            settledAt: any;
        }[];
    }>;
}
export declare const batchService: BatchService;
//# sourceMappingURL=batch.service.d.ts.map