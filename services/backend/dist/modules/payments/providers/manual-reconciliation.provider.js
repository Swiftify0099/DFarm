/**
 * ManualReconciliationProvider
 * Default provider for manual NEFT, RTGS, IMPS, UPI, Cheque, and Cash workflows.
 * Explicitly avoids simulating fake live payment executions.
 */
export class ManualReconciliationProvider {
    name = 'MANUAL_RECONCILIATION';
    async submitPayment(payout) {
        // Record submission for financial channel processing without fake immediate success
        return {
            success: true,
            providerTransactionId: `MAN-${payout.payoutId.substring(0, 8)}`,
            status: 'SUBMITTED',
            message: 'Payment recorded and queued for manual bank disbursement or statement reconciliation',
        };
    }
    async verifyPayment(reference) {
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
    async verifyWebhook(_payload, _signature, _timestamp) {
        return {
            isValid: false,
            error: 'Manual reconciliation provider does not accept automated gateway webhooks',
        };
    }
    async checkTransactionStatus(transactionId) {
        return {
            status: 'PENDING',
            transactionId,
        };
    }
}
//# sourceMappingURL=manual-reconciliation.provider.js.map