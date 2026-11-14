import { NotificationChannel, type NotificationRecord, type SendNotificationDTO } from '@dfarm/shared-types';
export declare class NotificationService {
    /**
     * Enqueues and dispatches an event-driven notification through the durable outbox.
     * Transactionally checks idempotency, customer consent, recipient validity, and renders templates.
     */
    static enqueueNotification(dto: SendNotificationDTO): Promise<NotificationRecord[]>;
    /**
     * Dispatches a notification record to the provider adapter with full delivery logging and retry handling.
     */
    static dispatchToProvider(record: NotificationRecord, rendered: {
        title: string;
        body: string;
        whatsappTemplateName?: string;
        language: 'mr' | 'en';
    }, variables?: Record<string, unknown>): Promise<NotificationRecord>;
    /**
     * Executes scheduled retry for pending notifications with exponential backoff.
     */
    static processRetries(limit?: number): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
    }>;
    /**
     * Lists customer notification inbox records.
     */
    static getCustomerInbox(customerId: string, organizationId: string, filters: {
        isRead?: boolean;
        channel?: NotificationChannel;
        page?: number;
        limit?: number;
    }): Promise<{
        notifications: NotificationRecord[];
        unreadCount: any;
        page: number;
        limit: number;
    }>;
    /**
     * Marks a specific notification as read.
     */
    static markAsRead(notificationId: string, customerId: string): Promise<NotificationRecord>;
    /**
     * Marks all notifications as read for a customer.
     */
    static markAllAsRead(customerId: string, organizationId: string): Promise<number>;
    /**
     * Retrieves underlying transaction receipt data linked to notification.
     */
    static getNotificationReceipt(notificationId: string, customerId: string): Promise<any>;
    private static mapRowToRecord;
}
//# sourceMappingURL=notification.service.d.ts.map