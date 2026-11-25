import type { UnionBankReconciliationSummary } from './types.js';
export declare class UnionBankResponseParser {
    /**
     * Parses Union Bank settlement reports / Reverse MIS files (CSV, Pipe-Delimited, or JSON).
     */
    static parseResponse(fileContent: string, submissionReference?: string): UnionBankReconciliationSummary;
    /**
     * Parses CSV or Pipe-delimited Union Bank Reverse MIS report.
     * Expected columns (any standard ordering recognized via header heuristics):
     * Customer Reference, Bank UTR, Amount, Status, Reason/Description, Date
     */
    private static parseDelimited;
    /**
     * Parses JSON responses from Union Bank Web Services or API callbacks.
     */
    private static parseJsonResponse;
    /**
     * Normalizes bank-specific status codes into DFarm standard settlement statuses.
     */
    static normalizeBankStatus(statusStr?: string, reason?: string): 'PAID' | 'FAILED' | 'REVERSED' | 'PENDING' | 'UNKNOWN';
    private static splitLine;
}
//# sourceMappingURL=UnionBankResponseParser.d.ts.map