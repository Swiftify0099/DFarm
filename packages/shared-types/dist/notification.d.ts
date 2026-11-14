import { NotificationChannel, NotificationEventType, NotificationStatus } from './enums.js';
export interface NotificationTemplate {
    id: string;
    organizationId?: string | null;
    templateCode: string;
    channel: NotificationChannel;
    language: string;
    titleTemplate: string;
    bodyTemplate: string;
    whatsappTemplateName?: string | null;
    whatsappNamespace?: string | null;
    variablesSchema?: Record<string, unknown> | Array<string> | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface NotificationRecord {
    id: string;
    organizationId: string;
    centerId?: string | null;
    customerId: string;
    eventType: NotificationEventType;
    eventId: string;
    idempotencyKey: string;
    channel: NotificationChannel;
    recipientPhone?: string | null;
    recipientToken?: string | null;
    title: string;
    body: string;
    metadata?: Record<string, unknown> | null;
    status: NotificationStatus;
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: string | null;
    lastAttemptedAt?: string | null;
    deliveredAt?: string | null;
    readAt?: string | null;
    failureReason?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface NotificationDeliveryLog {
    id: string;
    notificationRecordId: string;
    channel: NotificationChannel;
    provider: string;
    providerMessageId?: string | null;
    status: string;
    responseCode?: number | null;
    responsePayload?: Record<string, unknown> | null;
    errorMessage?: string | null;
    latencyMs?: number | null;
    createdAt: string;
}
export interface WhatsAppCustomerMapping {
    id: string;
    organizationId: string;
    customerId: string;
    phoneNumber: string;
    whatsappId?: string | null;
    isOptedIn: boolean;
    optInSource: string;
    optInTimestamp: string;
    optOutTimestamp?: string | null;
    optOutReason?: string | null;
    preferredLanguage: string;
    createdAt: string;
    updatedAt: string;
}
export interface WhatsAppMessage {
    id: string;
    organizationId: string;
    customerId: string;
    notificationRecordId?: string | null;
    direction: 'OUTBOUND' | 'INBOUND';
    wamid?: string | null;
    phoneNumber: string;
    templateName?: string | null;
    messageType: string;
    status: string;
    payload?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    sentAt?: string | null;
    deliveredAt?: string | null;
    readAt?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CustomerDeviceToken {
    id: string;
    customerId: string;
    deviceId: string;
    devicePlatform: 'ANDROID' | 'IOS' | 'WEB';
    fcmToken: string;
    isActive: boolean;
    lastRegisteredAt: string;
    deactivatedAt?: string | null;
    deactivationReason?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface ProviderEventRecord {
    id: string;
    provider: string;
    eventId: string;
    eventType?: string | null;
    rawPayload: Record<string, unknown>;
    processedStatus: string;
    processedAt: string;
    createdAt: string;
}
export interface CommunicationPreferenceDTO {
    customerId: string;
    whatsappOptIn: boolean;
    pushOptIn: boolean;
    smsOptIn: boolean;
    preferredLanguage: 'mr' | 'en';
    optOutReason?: string | null;
}
export interface DeviceTokenRegistrationDTO {
    deviceId: string;
    devicePlatform: 'ANDROID' | 'IOS' | 'WEB';
    fcmToken: string;
}
export interface SendNotificationDTO {
    organizationId: string;
    centerId?: string | null;
    customerId: string;
    eventType: NotificationEventType;
    eventId: string;
    idempotencyKey: string;
    channels?: NotificationChannel[];
    customTitle?: string;
    customBody?: string;
    metadata?: Record<string, unknown>;
    forceLanguage?: 'mr' | 'en';
}
//# sourceMappingURL=notification.d.ts.map