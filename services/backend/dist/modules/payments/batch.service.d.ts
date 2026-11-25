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
     * Creates a settlement batch with authoritative ledger calculation, duplicate checks,
     * bank validation warnings, and immutable calculation snapshots.
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
    submitForReview(batchId: string, auth: AuthContext): Promise<{
        batchId: string;
        status: string;
        submittedForReviewAt: string;
    }>;
    /**
     * Approves a settlement batch (Checker action). Enforces Maker-Checker segregation of duties.
     */
    approveBatch(batchId: string, auth: AuthContext): Promise<{
        batchId: string;
        status: string;
        approvedBy: string;
        approvedAt: string;
    }>;
    /**
     * Rejects a settlement batch with a reason. Releases reservations.
     */
    rejectBatch(batchId: string, reason: string, auth: AuthContext): Promise<{
        batchId: string;
        status: string;
        reason: string;
        rejectedBy: string;
    }>;
    /**
     * Submits batch to Union Bank of India via bulk file export or host-to-host API.
     */
    submitBatchToUnionBank(batchId: string, params: SubmitBatchToUnionBankParams, auth: AuthContext): Promise<{
        submissionId: string;
        submissionReference: string;
        batchId: string;
        batchNumber: string;
        status: string;
        submissionType: string;
        fileFormat?: string;
        fileName?: string;
        fileContent?: string;
        fileHashSha256: string;
        totalRecords: number;
        totalAmount: number;
        submittedAt: string;
    }>;
    /**
     * Reconciles batch items using bank response data / settlement report.
     */
    reconcileBatchWithUnionBank(batchId: string, responseData: any, auth: AuthContext): Promise<{
        batchId: string;
        batchStatus: string;
        reconciliationStatus: string;
        totalBeneficiaries: number;
        paidCount: number;
        successfulCount: number;
        failedCount: number;
        reversedCount: number;
        unknownCount: number;
        processedItems: Array<{
            itemId: string;
            customerReference: string;
            farmerCode: string;
            expectedAmount: number;
            bankAmount: number;
            bankUtr?: string;
            status: string;
            message: string;
            isIdempotentReplay: boolean;
        }>;
        exceptions: Array<{
            reference: string;
            reason: string;
        }>;
    }>;
    /**
     * Queries status of an in-flight or timed-out batch item from Union Bank.
     */
    queryBatchItemStatus(itemId: string, auth: AuthContext): Promise<{
        itemId: string;
        customerReference: string;
        previousStatus: string;
        currentStatus: string;
        bankUtr?: string;
        settledAt?: string;
        canSafeRetry: boolean;
        inquiryNotes: string;
    }>;
    /**
     * Marks batch items whose network transmission timed out as UNKNOWN.
     */
    markBatchTimeout(batchId: string, reason: string, auth: AuthContext): Promise<{
        updatedCount: number;
    }>;
    /**
     * Retrieves beneficiary bank detail revision history.
     */
    getBeneficiaryAuditHistory(customerId: string, auth: AuthContext): Promise<any[]>;
    /**
     * Updates beneficiary bank details with format validation and audit logging.
     */
    updateBeneficiaryBankDetails(customerId: string, bankData: {
        bankName: string;
        bankAccountNumber: string;
        bankIfscCode: string;
        bankAccountHolderName: string;
        verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'PENDING_VERIFICATION' | 'REJECTED';
        reason?: string;
    }, auth: AuthContext): Promise<{
        customerId: string;
        bankName: string;
        bankAccountNumberMask: string;
        bankIfscCode: string;
        bankAccountHolderName: any;
        bankVerificationStatus: "REJECTED" | "VERIFIED" | "UNVERIFIED" | "PENDING_VERIFICATION";
        updatedAt: string;
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
    getBatchById(batchId: string, auth: AuthContext): Promise<{
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
    exportBatch(batchId: string, format: string, auth: AuthContext): Promise<{
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