import type { AuthContext } from '../../../middleware/authenticate.js';
import type { UnionBankReconciliationItemResult } from './types.js';
export declare class UnionBankReconciliationService {
    /**
     * Reconciles a payment batch against Union Bank response data (raw string content, Reverse MIS, or parsed items).
     * Fully idempotent: duplicate reconciliation calls for the same item return the existing result without double-debiting.
     */
    static reconcileBatchWithBankData(batchId: string, bankResponseContentOrItems: string | UnionBankReconciliationItemResult[], auth: AuthContext): Promise<{
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
}
//# sourceMappingURL=UnionBankReconciliationService.d.ts.map