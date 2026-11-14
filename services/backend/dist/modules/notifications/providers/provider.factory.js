import { NotificationChannel } from '@dfarm/shared-types';
import { WhatsAppBusinessProvider } from './whatsapp.provider.js';
import { FirebaseFcmProvider } from './fcm.provider.js';
import { InAppNotificationProvider } from './in-app.provider.js';
export class NotificationProviderFactory {
    static providers = new Map([
        [NotificationChannel.WHATSAPP, new WhatsAppBusinessProvider()],
        [NotificationChannel.PUSH, new FirebaseFcmProvider()],
        [NotificationChannel.IN_APP, new InAppNotificationProvider()],
    ]);
    static getProvider(channel) {
        const provider = this.providers.get(channel);
        if (!provider) {
            throw new Error(`Unsupported notification channel: ${channel}`);
        }
        return provider;
    }
    /**
     * Registers or overrides a provider (useful for testing or custom gateways).
     */
    static registerProvider(channel, provider) {
        this.providers.set(channel, provider);
    }
}
//# sourceMappingURL=provider.factory.js.map