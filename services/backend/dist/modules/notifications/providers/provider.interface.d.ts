import { NotificationChannel, NotificationRecord } from '@dfarm/shared-types';
export interface ProviderSendResult {
    success: boolean;
    provider: string;
    providerMessageId?: string;
    status: 'SENT' | 'DELIVERED' | 'FAILED' | 'BLOCKED';
    responseCode?: number;
    rawResponse?: any;
    errorCode?: string;
    errorMessage?: string;
    latencyMs?: number;
}
export interface NotificationProvider {
    readonly channel: NotificationChannel;
    readonly name: string;
    send(record: NotificationRecord, rendered: {
        title: string;
        body: string;
        whatsappTemplateName?: string;
        language: 'mr' | 'en';
    }, variables?: Record<string, unknown>): Promise<ProviderSendResult>;
}
//# sourceMappingURL=provider.interface.d.ts.map