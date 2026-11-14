import { NotificationChannel, NotificationRecord } from '@dfarm/shared-types';
import { NotificationProvider, ProviderSendResult } from './provider.interface.js';
export declare class FirebaseFcmProvider implements NotificationProvider {
    readonly channel = NotificationChannel.PUSH;
    readonly name = "FIREBASE_FCM";
    send(record: NotificationRecord, rendered: {
        title: string;
        body: string;
        language: 'mr' | 'en';
    }, variables?: Record<string, unknown>): Promise<ProviderSendResult>;
    private deactivateInvalidToken;
}
//# sourceMappingURL=fcm.provider.d.ts.map