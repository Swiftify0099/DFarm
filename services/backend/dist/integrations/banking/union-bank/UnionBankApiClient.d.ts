import type { UnionBankConfig, UnionBankEnvironment, UnionBankBatchPayload, UnionBankReconciliationItemResult } from './types.js';
export declare class UnionBankApiClient {
    private config;
    constructor(customConfig?: Partial<UnionBankConfig>);
    getEnvironment(): UnionBankEnvironment;
    getDebitAccountNumber(): string;
    /**
     * Checks whether the current environment has valid Union Bank production credentials.
     */
    isProductionReady(): boolean;
    /**
     * Submits a payment batch directly to Union Bank API or Host-to-Host connector.
     * In Production: Enforces real bank credentials. If unconfigured, throws an informative error.
     * In UAT: Operates in test simulation/sandbox mode.
     */
    submitBatch(payload: UnionBankBatchPayload): Promise<{
        success: boolean;
        bankTransmissionReference: string;
        acknowledgementNumber: string;
        submissionTimestamp: string;
        environment: UnionBankEnvironment;
    }>;
    /**
     * Queries status of an in-flight or timed-out payment item from Union Bank.
     */
    queryPaymentStatus(customerReference: string, _bankReference?: string): Promise<UnionBankReconciliationItemResult>;
}
//# sourceMappingURL=UnionBankApiClient.d.ts.map