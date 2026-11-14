import type { AuthContext } from '../../middleware/authenticate.js';
export interface BankStatementRowInput {
    transactionDate: string;
    referenceNumber: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description?: string | null;
}
export interface BankStatementImportParams {
    fileName: string;
    rows: BankStatementRowInput[];
}
export declare class ReconciliationService {
    importBankStatementCsv(params: BankStatementImportParams, auth: AuthContext): Promise<{
        statementImportId: `${string}-${string}-${string}-${string}-${string}`;
        fileName: string;
        totalImportedRows: number;
        summary: {
            matchedCount: number;
            unmatchedCount: number;
            mismatchCount: number;
            duplicateCount: number;
        };
        records: any[];
    }>;
    processWebhook(payload: string | Buffer, signature: string, timestampHeader?: string, authContext?: AuthContext): Promise<{
        reconciliationId: any;
        status: any;
        matchedPayoutId: any;
        isIdempotentReplay: boolean;
        eventId?: undefined;
    } | {
        reconciliationId: `${string}-${string}-${string}-${string}-${string}`;
        eventId: string;
        status: string;
        matchedPayoutId: string | null;
        isIdempotentReplay: boolean;
    }>;
    resolveRecord(recordId: string, action: 'CONFIRMED_SETTLED' | 'FLAGGED_MISMATCH' | 'REJECTED_DUPLICATE' | 'MANUALLY_MATCHED' | 'DISMISSED', notes: string, auth: AuthContext, matchedPayoutId?: string | null): Promise<{
        recordId: string;
        action: "CONFIRMED_SETTLED" | "FLAGGED_MISMATCH" | "REJECTED_DUPLICATE" | "MANUALLY_MATCHED" | "DISMISSED";
        notes: string;
        resolvedBy: string;
        resolvedAt: string;
    }>;
    getReconciliationRecords(auth: AuthContext, filters?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<any[]>;
    private resolveDefaultOrgId;
}
export declare const reconciliationService: ReconciliationService;
//# sourceMappingURL=reconciliation.service.d.ts.map