import type { AuthContext } from '../../../middleware/authenticate.js';
export declare class UnionBankStatusInquiryService {
    private static apiClient;
    /**
     * Performs an authoritative status inquiry for a timed-out or UNKNOWN batch item.
     * Strict rule: UNKNOWN is NEVER automatically marked FAILED.
     */
    static queryItemStatus(itemId: string, auth: AuthContext, targetOrganizationId?: string | null): Promise<{
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
     * Marks in-flight items whose bank submission timed out as UNKNOWN inside ONE tenant transaction.
     * Strict rule: timeout never automatically fails payouts or debits ledger.
     */
    static markTimeoutUnknown(batchId: string, auth: AuthContext, reason?: string, targetOrganizationId?: string | null): Promise<{
        updatedCount: number;
    }>;
}
//# sourceMappingURL=UnionBankStatusInquiryService.d.ts.map