import type { AuthContext } from '../../../middleware/authenticate.js';
import type { UnionBankFileFormat } from './types.js';
export interface SubmitBatchToUnionBankParams {
    batchId: string;
    submissionType: 'BULK_FILE_EXPORT' | 'HOST_TO_HOST_API' | 'CAPS_PORTAL_EXPORT';
    fileFormat?: UnionBankFileFormat;
    debitAccountNumber?: string;
    notes?: string;
}
export declare class UnionBankSubmissionService {
    private static apiClient;
    /**
     * Dispatches or exports an approved payout batch to Union Bank of India.
     */
    static submitBatch(params: SubmitBatchToUnionBankParams, auth: AuthContext): Promise<{
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
}
//# sourceMappingURL=UnionBankSubmissionService.d.ts.map