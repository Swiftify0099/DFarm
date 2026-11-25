import type { AuthContext } from '../../../middleware/authenticate.js';
export declare class UnionBankStatusInquiryService {
    private static apiClient;
    /**
     * Performs an authoritative status inquiry for a timed-out or UNKNOWN batch item.
     * Strict rule: A timeout is NEVER automatically marked as failed.
     */
    static queryItemStatus(itemId: string, auth: AuthContext): Promise<{
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
     * Marks in-flight items whose bank submission timed out as UNKNOWN.
     */
    static markTimeoutUnknown(batchId: string, auth: AuthContext, reason?: string): Promise<{
        updatedCount: number;
    }>;
}
//# sourceMappingURL=UnionBankStatusInquiryService.d.ts.map