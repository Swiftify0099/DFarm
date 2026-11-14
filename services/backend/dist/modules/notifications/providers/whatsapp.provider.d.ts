import { NotificationChannel, NotificationRecord } from '@dfarm/shared-types';
import { NotificationProvider, ProviderSendResult } from './provider.interface.js';
export declare class WhatsAppBusinessProvider implements NotificationProvider {
    readonly channel = NotificationChannel.WHATSAPP;
    readonly name = "META_WHATSAPP_CLOUD";
    send(record: NotificationRecord, rendered: {
        title: string;
        body: string;
        whatsappTemplateName?: string;
        language: 'mr' | 'en';
    }, variables?: Record<string, unknown>): Promise<ProviderSendResult>;
    private recordMessage;
}
//# sourceMappingURL=whatsapp.provider.d.ts.map