import type { PaymentProvider, PayoutDetails, ProviderSubmitResult, ProviderVerifyResult, WebhookVerificationResult, TransactionStatusResult } from './provider.interface.js';
/**
 * ManualReconciliationProvider
 * Default provider for manual NEFT, RTGS, IMPS, UPI, Cheque, and Cash workflows.
 * Explicitly avoids simulating fake live payment executions.
 */
export declare class ManualReconciliationProvider implements PaymentProvider {
    readonly name = "MANUAL_RECONCILIATION";
    submitPayment(payout: PayoutDetails): Promise<ProviderSubmitResult>;
    verifyPayment(reference: string): Promise<ProviderVerifyResult>;
    verifyWebhook(_payload: string | Buffer, _signature: string, _timestamp?: string): Promise<WebhookVerificationResult>;
    checkTransactionStatus(transactionId: string): Promise<TransactionStatusResult>;
}
//# sourceMappingURL=manual-reconciliation.provider.d.ts.map