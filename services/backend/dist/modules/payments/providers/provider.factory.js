import { ManualReconciliationProvider } from './manual-reconciliation.provider.js';
import { ConfiguredBankWebhookAdapter } from './configured-bank-webhook.adapter.js';
export class PaymentProviderFactory {
    static defaultProvider = null;
    static getProvider() {
        if (!this.defaultProvider) {
            const webhookSecret = process.env['PAYMENT_WEBHOOK_SECRET'] || process.env['JWT_SECRET'];
            if (webhookSecret && webhookSecret.length >= 16) {
                this.defaultProvider = new ConfiguredBankWebhookAdapter({
                    webhookSecret,
                    maxTimestampSkewSeconds: 300,
                });
            }
            else {
                this.defaultProvider = new ManualReconciliationProvider();
            }
        }
        return this.defaultProvider;
    }
    static getManualProvider() {
        return new ManualReconciliationProvider();
    }
    static createWebhookAdapter(secret, maxSkewSeconds = 300) {
        return new ConfiguredBankWebhookAdapter({
            webhookSecret: secret,
            maxTimestampSkewSeconds: maxSkewSeconds,
        });
    }
}
//# sourceMappingURL=provider.factory.js.map