import type { AuthContext } from '../../middleware/authenticate.js';
import { CalculationPeriodParams } from './settlement-calculation.service.js';
import { SubmitBatchToUnionBankParams } from '../../integrations/banking/union-bank/UnionBankSubmissionService.js';
export interface CreateBatchParams {
    centerId?: string | null;
    billingCycleId?: string | null;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
    paymentMethod?: string;
    customerIds?: string[];
    payoutIds?: string[];
    idempotencyKey: string;
    excludeUnverifiedBankDetails?: boolean;
    debitAccountNumber?: string;
    targetOrganizationId?: string;
    initialStatus?: 'DRAFT' | 'CALCULATED';
}
export interface ReconcileBatchItemInput {
    itemId: string;
    status: 'SETTLED' | 'FAILED' | 'REVERSED';
    beneficiaryReference?: string | null;
    failureReason?: string | null;
}
export declare class BatchService {
    /**
     * Generates a preview calculation of farmer-wise payables for a settlement period.
     * Does not persist any records.
     */
    calculateSettlementPreview(params: CalculationPeriodParams, auth: AuthContext): Promise<import("./settlement-calculation.service.js").SettlementCalculationResult>;
    /**
     * Creates a settlement batch inside the strict dairy tenant DB transaction.
     */
    createBatch(params: CreateBatchParams, auth: AuthContext): Promise<{
        batchId: any;
        batchNumber: any;
        status: any;
        totalBeneficiaries: any;
        totalAmount: number;
        isIdempotentReplay: boolean;
        currency?: undefined;
        calculationSnapshotHash?: undefined;
        beneficiaries?: undefined;
        createdAt?: undefined;
    } | {
        batchId: `${string}-${string}-${string}-${string}-${string}`;
        batchNumber: string;
        status: "DRAFT" | "CALCULATED";
        totalBeneficiaries: number;
        totalAmount: number;
        currency: string;
        calculationSnapshotHash: any;
        beneficiaries: any[];
        isIdempotentReplay: boolean;
        createdAt: string;
    }>;
    /**
     * Submits a calculated batch for independent review (Maker -> Checker).
     */
    submitForReview(batchId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        batchId: string;
        status: string;
        submittedForReviewAt: string;
    }>;
    /**
     * Approves a settlement batch (Checker action). Enforces Maker-Checker segregation of duties.
     */
    approveBatch(batchId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        batchId: string;
        status: string;
        approvedBy: string;
        approvedAt: string;
    }>;
    /**
     * Rejects a settlement batch with a reason. Releases reservations.
     */
    rejectBatch(batchId: string, reason: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        batchId: string;
        status: string;
        reason: string;
        rejectedBy: string;
    }>;
    /**
     * Submits batch to Union Bank of India via bulk file export or host-to-host API.
     */
    submitBatchToUnionBank(batchId: string, params: SubmitBatchToUnionBankParams, auth: AuthContext): Promise<import("../../integrations/banking/union-bank/UnionBankSubmissionService.js").SubmitBatchToUnionBankResult>;
    /**
     * Reconciles batch items using bank response data / settlement report.
     */
    reconcileBatchWithUnionBank(batchId: string, responseData: any, auth: AuthContext, targetOrganizationId?: string): Promise<import("../../integrations/banking/union-bank/UnionBankReconciliationService.js").ReconciliationResult>;
    /**
     * Queries status of an in-flight or timed-out batch item from Union Bank.
     */
    queryBatchItemStatus(itemId: string, auth: AuthContext, targetOrganizationId?: string): Promise<{
        itemId: string;
        customerReference: string;
        previousStatus: string;
        currentStatus: string;
        bankUtr?: string;
        settledAt?: string;
        canSafeRetry: boolean;
        inquiryNotes: string;
        isIdempotentReplay?: boolean;
    }>;
    /**
     * Marks batch items whose network transmission timed out as UNKNOWN.
     */
    markBatchTimeout(batchId: string, reason: string, auth: AuthContext, targetOrganizationId?: string): Promise<{
        updatedCount: number;
    }>;
    /**
     * Retrieves beneficiary bank detail revision history.
     */
    getBeneficiaryAuditHistory(customerId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<any[]>;
    /**
     * Updates beneficiary bank details with format validation, encryption, and audit logging.
     */
    updateBeneficiaryBankDetails(customerId: string, bankData: {
        bankName: string;
        bankAccountNumber: string;
        bankIfscCode: string;
        bankAccountHolderName: string;
        verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'PENDING_VERIFICATION' | 'REJECTED';
        reason?: string;
    }, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        customerId: string;
        bankName: string;
        bankAccountNumberMask: string;
        bankIfscCode: string;
        bankAccountHolderName: any;
        bankVerificationStatus: "REJECTED" | "VERIFIED" | "UNVERIFIED" | "PENDING_VERIFICATION";
        updatedAt: string;
    }>;
    submitBatch(batchId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        batchId: string;
        status: string;
        submittedAt: string;
        ledgerEffectApplied: boolean;
    }>;
    reconcileBatch(batchId: string, results: ReconcileBatchItemInput[], auth: AuthContext, targetOrganizationId?: string | null): Promise<{
        batchId: string;
        batchStatus: string;
        reconciliationStatus: string;
        totalBeneficiaries: number;
        successfulCount: number;
        failedCount: number;
        processedInCall: number;
        items: any[];
    }>;
    getBatchById(batchId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
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
        calculationSnapshotHash: any;
        bankName: any;
        bankChannel: any;
        bankBatchReference: any;
        bankSubmissionId: any;
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
            bankUtr: any;
            failureReason: any;
            settledAt: any;
            grossPayable: number | undefined;
            totalDeductions: number | undefined;
            netPayable: number;
            remainingBalance: number | undefined;
        }[];
    }>;
    exportBatch(batchId: string, format: string, auth: AuthContext, options?: {
        debitAccountNumber?: string;
        targetOrganizationId?: string;
    }): Promise<{
        batchId: string;
        batchNumber: string;
        format: string;
        fileName: string;
        rowCount: number;
        totalAmount: number;
        checksumSha256: string;
        downloadToken: string;
        expiresInSeconds: number;
    }>;
    downloadBatch(token: string): import("./serializers/IBankFileSerializer.js").SerializedBankFile;
}
export declare const batchService: BatchService;
//# sourceMappingURL=batch.service.d.ts.map