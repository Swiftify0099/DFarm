import type { PaymentProvider } from './provider.interface.js';
import { ManualReconciliationProvider } from './manual-reconciliation.provider.js';
import { ConfiguredBankWebhookAdapter } from './configured-bank-webhook.adapter.js';

export class PaymentProviderFactory {
  private static defaultProvider: PaymentProvider | null = null;

  public static getProvider(): PaymentProvider {
    if (!this.defaultProvider) {
      const webhookSecret = process.env['PAYMENT_WEBHOOK_SECRET'] || process.env['JWT_SECRET'];
      if (webhookSecret && webhookSecret.length >= 16) {
        this.defaultProvider = new ConfiguredBankWebhookAdapter({
          webhookSecret,
          maxTimestampSkewSeconds: 300,
        });
      } else {
        this.defaultProvider = new ManualReconciliationProvider();
      }
    }
    return this.defaultProvider;
  }

  public static getManualProvider(): PaymentProvider {
    return new ManualReconciliationProvider();
  }

  public static createWebhookAdapter(secret: string, maxSkewSeconds = 300): ConfiguredBankWebhookAdapter {
    return new ConfiguredBankWebhookAdapter({
      webhookSecret: secret,
      maxTimestampSkewSeconds: maxSkewSeconds,
    });
  }
}

