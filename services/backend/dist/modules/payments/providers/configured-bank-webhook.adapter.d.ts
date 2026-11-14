import type { PaymentProvider, PayoutDetails, ProviderSubmitResult, ProviderVerifyResult, WebhookVerificationResult, TransactionStatusResult } from './provider.interface.js';
export interface WebhookAdapterConfig {
    webhookSecret: string;
    maxTimestampSkewSeconds?: number;
}
export declare class ConfiguredBankWebhookAdapter implements PaymentProvider {
    readonly name = "CONFIGURED_BANK_WEBHOOK";
    private readonly secret;
    private readonly maxSkewSeconds;
    constructor(config: WebhookAdapterConfig);
    submitPayment(payout: PayoutDetails): Promise<ProviderSubmitResult>;
    verifyPayment(reference: string): Promise<ProviderVerifyResult>;
    verifyWebhook(payload: string | Buffer, signature: string, timestampHeader?: string): Promise<WebhookVerificationResult>;
    checkTransactionStatus(transactionId: string): Promise<TransactionStatusResult>;
}
//# sourceMappingURL=configured-bank-webhook.adapter.d.ts.map