import { NotificationChannel, NotificationRecord } from '@dfarm/shared-types';
import { NotificationProvider, ProviderSendResult } from './provider.interface.js';
export declare class InAppNotificationProvider implements NotificationProvider {
    readonly channel = NotificationChannel.IN_APP;
    readonly name = "INTERNAL_INBOX";
    send(record: NotificationRecord, rendered: {
        title: string;
        body: string;
        language: 'mr' | 'en';
    }, variables?: Record<string, unknown>): Promise<ProviderSendResult>;
    private mapToCustomerNotificationType;
}
//# sourceMappingURL=in-app.provider.d.ts.map