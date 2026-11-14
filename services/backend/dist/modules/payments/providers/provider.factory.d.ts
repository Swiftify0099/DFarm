import type { PaymentProvider } from './provider.interface.js';
import { ConfiguredBankWebhookAdapter } from './configured-bank-webhook.adapter.js';
export declare class PaymentProviderFactory {
    private static defaultProvider;
    static getProvider(): PaymentProvider;
    static getManualProvider(): PaymentProvider;
    static createWebhookAdapter(secret: string, maxSkewSeconds?: number): ConfiguredBankWebhookAdapter;
}
//# sourceMappingURL=provider.factory.d.ts.map