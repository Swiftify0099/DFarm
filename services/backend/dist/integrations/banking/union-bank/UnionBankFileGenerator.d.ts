import type { UnionBankBatchPayload, UnionBankGeneratedFile, UnionBankFileFormat } from './types.js';
export declare class UnionBankFileGenerator {
    /**
     * Generates bank-approved bulk payout files for Union Bank of India.
     * Supports:
     * 1. UNION_BANK_BULK_NEFT_CSV - Corporate Internet Banking Bulk Upload Format
     * 2. UNION_BANK_CAPS_TXT - Union Bank Cash Management Services (CAPS) Pipe-Delimited
     */
    static generateFile(payload: UnionBankBatchPayload, format?: UnionBankFileFormat): UnionBankGeneratedFile;
    static generateBulkNeftCsv(payload: UnionBankBatchPayload): UnionBankGeneratedFile;
    static generateCapsFile(payload: UnionBankBatchPayload): UnionBankGeneratedFile;
    /**
     * Generates Union Bank Corporate Bulk NEFT/RTGS CSV file.
     * Header:
     * Transaction Type,Debit Account Number,Beneficiary Account Number,Beneficiary Name,Beneficiary IFSC,Amount,Customer Reference,Narration,Value Date
     */
    private static generateBulkNeftCsvFormat;
    /**
     * Generates Union Bank CAPS (Cash Management Services) pipe-delimited upload format.
     * Format:
     * PAYMENT_TYPE|DEBIT_ACCOUNT|BENEFICIARY_ACCOUNT|BENEFICIARY_NAME|IFSC|AMOUNT|PAYMENT_REF|REMARKS|VALUE_DATE
     */
    private static generateCapsFormat;
}
//# sourceMappingURL=UnionBankFileGenerator.d.ts.map