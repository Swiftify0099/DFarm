import { NotificationChannel } from '@dfarm/shared-types';
import { query } from '../../../db.js';
import { logger } from '../../../shared/logger/index.js';
export class InAppNotificationProvider {
    channel = NotificationChannel.IN_APP;
    name = 'INTERNAL_INBOX';
    async send(record, rendered, variables = {}) {
        const startTime = Date.now();
        try {
            // Map event_type to valid check constraint type in customer_notifications if applicable
            const notifType = this.mapToCustomerNotificationType(record.eventType);
            const res = await query(`INSERT INTO customer_notifications (
           organization_id, customer_id, title, message,
           notification_type, metadata, is_read, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NOW())
         RETURNING id;`, [
                record.organizationId,
                record.customerId,
                rendered.title,
                rendered.body,
                notifType,
                JSON.stringify({
                    eventId: record.eventId,
                    eventType: record.eventType,
                    notificationRecordId: record.id,
                    ...variables,
                }),
            ]);
            const inboxId = res.rows[0]?.id;
            return {
                success: true,
                provider: this.name,
                providerMessageId: inboxId,
                status: 'DELIVERED',
                responseCode: 200,
                latencyMs: Date.now() - startTime,
            };
        }
        catch (err) {
            logger.error({ error: err.message, customerId: record.customerId }, 'Failed to insert customer_notification');
            return {
                success: false,
                provider: this.name,
                status: 'FAILED',
                errorCode: 'INBOX_WRITE_FAILED',
                errorMessage: err.message,
                latencyMs: Date.now() - startTime,
            };
        }
    }
    mapToCustomerNotificationType(eventType) {
        switch (eventType) {
            case 'MILK_COLLECTION_COMPLETED':
                return 'MILK_COLLECTION';
            case 'MONTHLY_BILL_GENERATED':
                return 'BILL_GENERATED';
            case 'MONTHLY_BILL_STATEMENT_AVAILABLE':
                return 'BILL_FINALIZED';
            case 'PAYMENT_SETTLED':
                return 'PAYMENT_DISBURSED';
            case 'CUSTOMER_REPAYMENT_RECEIVED':
                return 'PAYMENT_RECEIVED';
            case 'FEED_PURCHASE_COMPLETED':
                return 'FEED_PURCHASE';
            case 'CUSTOMER_ADVANCE_RECORDED':
                return 'ADVANCE_APPROVED';
            default:
                return 'GENERAL_ANNOUNCEMENT';
        }
    }
}
//# sourceMappingURL=in-app.provider.js.map