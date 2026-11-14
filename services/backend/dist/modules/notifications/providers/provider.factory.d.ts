import { NotificationChannel } from '@dfarm/shared-types';
import { NotificationProvider } from './provider.interface.js';
export declare class NotificationProviderFactory {
    private static providers;
    static getProvider(channel: NotificationChannel): NotificationProvider;
    /**
     * Registers or overrides a provider (useful for testing or custom gateways).
     */
    static registerProvider(channel: NotificationChannel, provider: NotificationProvider): void;
}
//# sourceMappingURL=provider.factory.d.ts.map