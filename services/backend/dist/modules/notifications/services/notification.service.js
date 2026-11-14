import { NotificationChannel, NotificationStatus, } from '@dfarm/shared-types';
import { query } from '../../../db.js';
import { logger } from '../../../shared/logger/index.js';
import { maskPhoneNumber, normalizeE164Phone } from '../../../shared/utils/phone.js';
import { TemplateEngine } from '../templates/template.engine.js';
import { NotificationProviderFactory } from '../providers/provider.factory.js';
import { ConsentService } from './consent.service.js';
import { DeviceTokenService } from './device-token.service.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
export class NotificationService {
    /**
     * Enqueues and dispatches an event-driven notification through the durable outbox.
     * Transactionally checks idempotency, customer consent, recipient validity, and renders templates.
     */
    static async enqueueNotification(dto) {
        const { organizationId, customerId, eventType, eventId, idempotencyKey, customTitle, customBody, metadata = {}, forceLanguage, } = dto;
        // 1. Fetch authoritative Customer record
        const custRes = await query(`SELECT c.id, c.organization_id, c.primary_center_id, c.full_name, c.normalized_mobile_number, c.farmer_code
       FROM customers c
       WHERE c.id = $1 AND c.organization_id = $2;`, [customerId, organizationId]);
        if (custRes.rows.length === 0) {
            throw new NotFoundError(`Customer '${customerId}' not found in organization`);
        }
        const customer = custRes.rows[0];
        const customerPhone = customer.normalized_mobile_number;
        const centerId = dto.centerId || customer.primary_center_id;
        // 2. Fetch Customer communication preferences
        const prefs = await ConsentService.getCustomerPreferences(customerId, organizationId);
        const language = forceLanguage || prefs.preferredLanguage || 'mr';
        // 3. Determine channels to dispatch
        const targetChannels = dto.channels && dto.channels.length > 0
            ? dto.channels
            : [NotificationChannel.WHATSAPP, NotificationChannel.PUSH, NotificationChannel.IN_APP];
        const records = [];
        // Combine variables for template rendering
        const variables = {
            customerName: customer.full_name,
            farmerCode: customer.farmer_code,
            phone: customerPhone,
            date: new Date().toLocaleDateString('en-GB'),
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            ...metadata,
        };
        for (const channel of targetChannels) {
            // 4. Check Idempotency by (organization_id, event_id, channel)
            const existing = await query(`SELECT * FROM notification_records
         WHERE organization_id = $1 AND event_id = $2 AND channel = $3;`, [organizationId, eventId, channel]);
            if (existing.rows.length > 0) {
                const row = existing.rows[0];
                logger.info({ eventId, channel, customerId, recordId: row.id }, 'Notification event already queued (idempotency acknowledged)');
                records.push(this.mapRowToRecord(row));
                continue;
            }
            // 5. Enforce Customer Communication Consent & Opt-Out
            const hasConsent = await ConsentService.isConsentGranted(customerId, channel, organizationId);
            if (!hasConsent) {
                logger.info({ customerId, channel, eventType }, 'Customer has opted out of notifications for this channel');
                const outRes = await query(`INSERT INTO notification_records (
             organization_id, center_id, customer_id, event_type,
             event_id, idempotency_key, channel, recipient_phone,
             title, body, metadata, status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'OPTED_OUT', NOW(), NOW())
           RETURNING *;`, [
                    organizationId,
                    centerId,
                    customerId,
                    eventType,
                    eventId,
                    `${idempotencyKey}_${channel}`,
                    channel,
                    customerPhone ? maskPhoneNumber(customerPhone) : null,
                    customTitle || `Notification: ${eventType}`,
                    customBody || 'Opted out by customer',
                    JSON.stringify(metadata),
                ]);
                records.push(this.mapRowToRecord(outRes.rows[0]));
                continue;
            }
            // 6. Recipient preparation & format validation
            let recipientPhone = null;
            let recipientToken = null;
            if (channel === NotificationChannel.WHATSAPP) {
                try {
                    recipientPhone = normalizeE164Phone(customerPhone);
                }
                catch (phoneErr) {
                    logger.warn({ customerId, phone: customerPhone }, 'Invalid recipient phone number format for WhatsApp delivery');
                    const failRes = await query(`INSERT INTO notification_records (
               organization_id, center_id, customer_id, event_type,
               event_id, idempotency_key, channel, recipient_phone,
               title, body, metadata, status, failure_reason, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'FAILED', $12, NOW(), NOW())
             RETURNING *;`, [
                        organizationId,
                        centerId,
                        customerId,
                        eventType,
                        eventId,
                        `${idempotencyKey}_${channel}`,
                        channel,
                        customerPhone,
                        customTitle || `Notification: ${eventType}`,
                        customBody || 'Invalid recipient phone',
                        JSON.stringify(metadata),
                        'INVALID_PHONE_NUMBER: Phone number must follow valid E.164 format',
                    ]);
                    records.push(this.mapRowToRecord(failRes.rows[0]));
                    continue;
                }
            }
            else if (channel === NotificationChannel.PUSH) {
                const tokens = await DeviceTokenService.getActiveTokens(customerId);
                recipientToken = (tokens.length > 0 && tokens[0]) ? tokens[0] : null;
            }
            // 7. Render Template
            const rendered = await TemplateEngine.render(eventType, channel, language, variables, organizationId);
            const title = customTitle || rendered.title;
            const body = customBody || rendered.body;
            // 8. Insert Notification Record in Outbox (Initial PENDING status)
            const insertRes = await query(`INSERT INTO notification_records (
           organization_id, center_id, customer_id, event_type,
           event_id, idempotency_key, channel, recipient_phone,
           recipient_token, title, body, metadata, status,
           retry_count, max_retries, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', 0, 3, NOW(), NOW())
         RETURNING *;`, [
                organizationId,
                centerId,
                customerId,
                eventType,
                eventId,
                `${idempotencyKey}_${channel}`,
                channel,
                recipientPhone,
                recipientToken,
                title,
                body,
                JSON.stringify(metadata),
            ]);
            const createdRecord = this.mapRowToRecord(insertRes.rows[0]);
            // 9. Dispatch via Provider
            const dispatchedRecord = await this.dispatchToProvider(createdRecord, rendered, variables);
            records.push(dispatchedRecord);
        }
        return records;
    }
    /**
     * Dispatches a notification record to the provider adapter with full delivery logging and retry handling.
     */
    static async dispatchToProvider(record, rendered, variables = {}) {
        const provider = NotificationProviderFactory.getProvider(record.channel);
        const maskedPhone = maskPhoneNumber(record.recipientPhone);
        logger.info({ recordId: record.id, channel: record.channel, recipient: maskedPhone }, 'Dispatching notification through provider');
        const result = await provider.send(record, rendered, variables);
        // Record Delivery Log
        await query(`INSERT INTO notification_delivery_logs (
         notification_record_id, channel, provider, provider_message_id,
         status, response_code, response_payload, error_message, latency_ms, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());`, [
            record.id,
            record.channel,
            result.provider,
            result.providerMessageId || null,
            result.status,
            result.responseCode || null,
            result.rawResponse ? JSON.stringify(result.rawResponse) : null,
            result.errorMessage || null,
            result.latencyMs || null,
        ]);
        // Update Notification Record status based on result
        let finalStatus = record.status;
        let nextRetry = null;
        let failureReason = null;
        let retryIncrement = 0;
        let isDelivered = false;
        if (result.success) {
            finalStatus = result.status === 'DELIVERED' ? NotificationStatus.DELIVERED : NotificationStatus.SENT;
            isDelivered = result.status === 'DELIVERED';
        }
        else if (result.status === 'BLOCKED') {
            finalStatus = NotificationStatus.BLOCKED;
            failureReason = result.errorMessage || 'Provider integration is unconfigured or blocked';
        }
        else {
            // Failed - calculate exponential backoff retry
            const newRetryCount = record.retryCount + 1;
            if (newRetryCount < record.maxRetries) {
                finalStatus = NotificationStatus.PENDING;
                retryIncrement = 1;
                const delaySeconds = Math.pow(2, newRetryCount) * 5; // 10s, 20s, 40s
                nextRetry = new Date(Date.now() + delaySeconds * 1000);
                failureReason = `Attempt ${newRetryCount} failed: ${result.errorMessage}`;
            }
            else {
                finalStatus = NotificationStatus.FAILED;
                failureReason = `Exhausted ${record.maxRetries} delivery retries. Final error: ${result.errorMessage}`;
            }
        }
        const updatedRes = await query(`UPDATE notification_records
       SET status = $1,
           retry_count = retry_count + $2,
           next_retry_at = $3,
           last_attempted_at = NOW(),
           delivered_at = CASE WHEN $4::boolean = TRUE THEN NOW() ELSE delivered_at END,
           failure_reason = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *;`, [finalStatus, retryIncrement, nextRetry, isDelivered, failureReason, record.id]);
        return this.mapRowToRecord(updatedRes.rows[0]);
    }
    /**
     * Executes scheduled retry for pending notifications with exponential backoff.
     */
    static async processRetries(limit = 20) {
        const res = await query(`SELECT * FROM notification_records
       WHERE status = 'PENDING'
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         AND retry_count < max_retries
       ORDER BY created_at ASC
       LIMIT $1;`, [limit]);
        let succeeded = 0;
        let failed = 0;
        for (const row of res.rows) {
            const record = this.mapRowToRecord(row);
            const rendered = await TemplateEngine.render(record.eventType, record.channel, 'mr', record.metadata || {}, record.organizationId);
            const updated = await this.dispatchToProvider(record, rendered, record.metadata || {});
            if (updated.status === NotificationStatus.SENT || updated.status === NotificationStatus.DELIVERED) {
                succeeded++;
            }
            else {
                failed++;
            }
        }
        return { processed: res.rows.length, succeeded, failed };
    }
    /**
     * Lists customer notification inbox records.
     */
    static async getCustomerInbox(customerId, organizationId, filters) {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const offset = (page - 1) * limit;
        let sql = `SELECT * FROM notification_records WHERE customer_id = $1 AND organization_id = $2`;
        const params = [customerId, organizationId];
        if (filters.isRead !== undefined) {
            sql += filters.isRead ? ` AND status = 'READ'` : ` AND status <> 'READ'`;
        }
        if (filters.channel) {
            params.push(filters.channel);
            sql += ` AND channel = $${params.length}`;
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
        params.push(limit, offset);
        const res = await query(sql, params);
        // Count unread
        const unreadRes = await query(`SELECT COUNT(*)::int as count FROM notification_records
       WHERE customer_id = $1 AND organization_id = $2 AND status <> 'READ';`, [customerId, organizationId]);
        return {
            notifications: res.rows.map(r => this.mapRowToRecord(r)),
            unreadCount: unreadRes.rows[0]?.count || 0,
            page,
            limit,
        };
    }
    /**
     * Marks a specific notification as read.
     */
    static async markAsRead(notificationId, customerId) {
        const res = await query(`UPDATE notification_records
       SET status = 'READ',
           read_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND customer_id = $2
       RETURNING *;`, [notificationId, customerId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Notification '${notificationId}' not found for customer`);
        }
        // Also update customer_notifications if linked
        await query(`UPDATE customer_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE customer_id = $1 AND (metadata->>'notificationRecordId')::uuid = $2;`, [customerId, notificationId]).catch(() => { });
        return this.mapRowToRecord(res.rows[0]);
    }
    /**
     * Marks all notifications as read for a customer.
     */
    static async markAllAsRead(customerId, organizationId) {
        const res = await query(`UPDATE notification_records
       SET status = 'READ',
           read_at = NOW(),
           updated_at = NOW()
       WHERE customer_id = $1 AND organization_id = $2 AND status <> 'READ'
       RETURNING id;`, [customerId, organizationId]);
        // Also update customer_notifications
        await query(`UPDATE customer_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE customer_id = $1 AND is_read = FALSE;`, [customerId]).catch(() => { });
        return res.rows.length;
    }
    /**
     * Retrieves underlying transaction receipt data linked to notification.
     */
    static async getNotificationReceipt(notificationId, customerId) {
        const res = await query(`SELECT metadata, event_type, created_at FROM notification_records WHERE id = $1 AND customer_id = $2;`, [notificationId, customerId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Notification '${notificationId}' not found`);
        }
        const row = res.rows[0];
        return {
            notificationId,
            eventType: row.event_type,
            receiptDetails: row.metadata,
            timestamp: row.created_at,
        };
    }
    static mapRowToRecord(r) {
        return {
            id: r.id,
            organizationId: r.organization_id,
            centerId: r.center_id,
            customerId: r.customer_id,
            eventType: r.event_type,
            eventId: r.event_id,
            idempotencyKey: r.idempotency_key,
            channel: r.channel,
            recipientPhone: r.recipient_phone,
            recipientToken: r.recipient_token,
            title: r.title,
            body: r.body,
            metadata: r.metadata,
            status: r.status,
            retryCount: r.retry_count,
            maxRetries: r.max_retries,
            nextRetryAt: r.next_retry_at,
            lastAttemptedAt: r.last_attempted_at,
            deliveredAt: r.delivered_at,
            readAt: r.read_at,
            failureReason: r.failure_reason,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
//# sourceMappingURL=notification.service.js.map