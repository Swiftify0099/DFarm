import type {
  PaymentProvider,
  PayoutDetails,
  ProviderSubmitResult,
  ProviderVerifyResult,
  WebhookVerificationResult,
  TransactionStatusResult,
} from './provider.interface.js';

/**
 * ManualReconciliationProvider
 * Default provider for manual NEFT, RTGS, IMPS, UPI, Cheque, and Cash workflows.
 * Explicitly avoids simulating fake live payment executions.
 */
export class ManualReconciliationProvider implements PaymentProvider {
  public readonly name = 'MANUAL_RECONCILIATION';

  async submitPayment(payout: PayoutDetails): Promise<ProviderSubmitResult> {
    // Record submission for financial channel processing without fake immediate success
    return {
      success: true,
      providerTransactionId: `MAN-${payout.payoutId.substring(0, 8)}`,
      status: 'SUBMITTED',
      message: 'Payment recorded and queued for manual bank disbursement or statement reconciliation',
    };
  }

  async verifyPayment(reference: string): Promise<ProviderVerifyResult> {
    if (!reference || reference.trim().length === 0) {
      return {
        verified: false,
        status: 'UNKNOWN',
      };
    }

    // Without genuine bank gateway connection, verification requires uploaded statement or manual confirmation
    return {
      verified: false,
      status: 'PENDING',
      bankReference: reference,
    };
  }

  async verifyWebhook(_payload: string | Buffer, _signature: string, _timestamp?: string): Promise<WebhookVerificationResult> {
    return {
      isValid: false,
      error: 'Manual reconciliation provider does not accept automated gateway webhooks',
    };
  }

  async checkTransactionStatus(transactionId: string): Promise<TransactionStatusResult> {
    return {
      status: 'PENDING',
      transactionId,
    };
  }
}

