export interface PayoutDetails {
    payoutId: string;
    amount: number;
    currency: string;
    recipientName: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
    referenceNumber: string;
}
export interface ProviderSubmitResult {
    success: boolean;
    providerTransactionId?: string;
    status: 'SUBMITTED' | 'PENDING' | 'REJECTED';
    message: string;
    rawResponse?: Record<string, unknown>;
}
export interface ProviderVerifyResult {
    verified: boolean;
    status: 'SETTLED' | 'PENDING' | 'FAILED' | 'UNKNOWN';
    amount?: number;
    bankReference?: string;
    settledAt?: Date;
    rawResponse?: Record<string, unknown>;
}
export interface WebhookVerificationResult {
    isValid: boolean;
    eventId?: string;
    eventType?: string;
    timestamp?: Date;
    payload?: any;
    error?: string;
}
export interface TransactionStatusResult {
    status: 'SETTLED' | 'PENDING' | 'FAILED' | 'UNKNOWN';
    transactionId: string;
    externalReference?: string;
    amount?: number;
    settledAt?: Date;
    failureReason?: string;
}
export interface PaymentProvider {
    readonly name: string;
    submitPayment(payout: PayoutDetails): Promise<ProviderSubmitResult>;
    verifyPayment(reference: string): Promise<ProviderVerifyResult>;
    verifyWebhook(payload: string | Buffer, signature: string, timestamp?: string): Promise<WebhookVerificationResult>;
    checkTransactionStatus(transactionId: string): Promise<TransactionStatusResult>;
}
//# sourceMappingURL=provider.interface.d.ts.map