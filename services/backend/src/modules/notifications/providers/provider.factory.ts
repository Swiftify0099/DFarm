import { NotificationChannel } from '@dfarm/shared-types';
import { NotificationProvider } from './provider.interface.js';
import { WhatsAppBusinessProvider } from './whatsapp.provider.js';
import { FirebaseFcmProvider } from './fcm.provider.js';
import { InAppNotificationProvider } from './in-app.provider.js';

export class NotificationProviderFactory {
  private static providers: Map<NotificationChannel, NotificationProvider> = new Map<NotificationChannel, NotificationProvider>([
    [NotificationChannel.WHATSAPP, new WhatsAppBusinessProvider() as NotificationProvider],
    [NotificationChannel.PUSH, new FirebaseFcmProvider() as NotificationProvider],
    [NotificationChannel.IN_APP, new InAppNotificationProvider() as NotificationProvider],
  ]);

  public static getProvider(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new Error(`Unsupported notification channel: ${channel}`);
    }
    return provider;
  }

  /**
   * Registers or overrides a provider (useful for testing or custom gateways).
   */
  public static registerProvider(channel: NotificationChannel, provider: NotificationProvider): void {
    this.providers.set(channel, provider);
  }
}
