export type UnionBankEnvironment = 'UAT' | 'PRODUCTION';
export type UnionBankFileFormat = 'UNION_BANK_BULK_NEFT_CSV' | 'UNION_BANK_CAPS_TXT';
export type UnionBankItemStatus = 'PENDING' | 'SUBMITTED_TO_BANK' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REVERSED' | 'UNKNOWN';
export interface UnionBankConfig {
    environment: UnionBankEnvironment;
    corporateId?: string;
    userId?: string;
    clientId?: string;
    clientSecret?: string;
    baseUrl?: string;
    debitAccountNumber?: string;
    encryptionPublicKey?: string;
    sftpHost?: string;
    sftpUser?: string;
    sftpPort?: number;
}
export interface UnionBankPayoutItem {
    itemId: string;
    payoutId: string;
    farmerCode: string;
    customerName: string;
    bankAccount: string;
    bankIfsc: string;
    amount: number;
    referenceNumber: string;
    narration?: string;
}
export interface UnionBankBatchPayload {
    batchId: string;
    batchNumber: string;
    organizationId: string;
    organizationName?: string;
    debitAccountNumber: string;
    valueDate: string;
    items: UnionBankPayoutItem[];
}
export interface UnionBankGeneratedFile {
    format: UnionBankFileFormat;
    fileName: string;
    mimeType: string;
    content: string;
    totalRecords: number;
    totalAmount: number;
    checksumSha256: string;
}
export interface UnionBankReconciliationItemResult {
    customerReference: string;
    bankUtr?: string;
    bankReference?: string;
    amount: number;
    status: 'PAID' | 'FAILED' | 'REVERSED' | 'PENDING' | 'UNKNOWN';
    failureReason?: string;
    transactionDate?: string;
    rawRecord?: any;
}
export interface UnionBankReconciliationSummary {
    submissionReference?: string;
    totalProcessed: number;
    paidCount: number;
    paidAmount: number;
    failedCount: number;
    failedAmount: number;
    reversedCount: number;
    unknownCount: number;
    items: UnionBankReconciliationItemResult[];
}
//# sourceMappingURL=types.d.ts.map