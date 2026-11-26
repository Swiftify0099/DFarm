import crypto from 'node:crypto';
import { query } from '../../../db.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../shared/logger/index.js';
import { BadRequestError } from '../../../shared/errors/app-error.js';
export class WhatsAppWebhookHandler {
    /**
     * Verifies Meta WhatsApp Webhook verification challenge (GET request).
     */
    static verifyChallenge(mode, verifyToken, challenge) {
        const isProduction = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
        const configuredToken = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] || config.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        if (isProduction &&
            (!configuredToken ||
                configuredToken === 'dfarm_whatsapp_verify_token_default' ||
                configuredToken.toLowerCase().includes('placeholder'))) {
            logger.error('WhatsApp webhook verification failed: production verify token not configured');
            throw new BadRequestError('Webhook verification is not configured', 'WEBHOOK_NOT_CONFIGURED');
        }
        if (mode === 'subscribe' && verifyToken === configuredToken) {
            logger.info('WhatsApp webhook verification challenge verified successfully');
            return challenge;
        }
        logger.warn({ mode }, 'WhatsApp webhook challenge verification failed');
        throw new BadRequestError('Invalid webhook verification token or mode', 'INVALID_VERIFICATION_TOKEN');
    }
    /**
     * Verifies HMAC-SHA256 signature from Meta (x-hub-signature-256 header).
     */
    static verifySignature(rawBody, signatureHeader) {
        const isProduction = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
        const appSecret = process.env['WHATSAPP_APP_SECRET'] || config.WHATSAPP_APP_SECRET;
        if (isProduction &&
            (!appSecret ||
                appSecret === 'dfarm_whatsapp_app_secret_placeholder' ||
                appSecret.toLowerCase().includes('placeholder'))) {
            logger.error('WhatsApp webhook rejected: production WHATSAPP_APP_SECRET not configured');
            return false;
        }
        if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
            logger.warn('WhatsApp webhook rejected: Missing or invalid x-hub-signature-256 header');
            return false;
        }
        const expectedSignature = signatureHeader.slice(7); // strip 'sha256='
        const hmac = crypto.createHmac('sha256', appSecret);
        hmac.update(rawBody);
        const calculatedSignature = hmac.digest('hex');
        if (calculatedSignature.length !== expectedSignature.length) {
            return false;
        }
        try {
            return crypto.timingSafeEqual(Buffer.from(calculatedSignature, 'hex'), Buffer.from(expectedSignature, 'hex'));
        }
        catch {
            return false;
        }
    }
    /**
     * Processes incoming WhatsApp status webhook payload with replay protection and deduplication.
     */
    static async processWebhook(rawBody, signatureHeader, payload) {
        // 1. Verify HMAC Signature
        const isValidSignature = this.verifySignature(rawBody, signatureHeader);
        if (!isValidSignature) {
            throw new BadRequestError('Invalid webhook HMAC signature', 'INVALID_WEBHOOK_SIGNATURE');
        }
        // 2. Extract Event ID for Replay Protection
        const entries = payload?.entry || [];
        let statusCount = 0;
        for (const entry of entries) {
            const changes = entry?.changes || [];
            for (const change of changes) {
                const val = change?.value;
                const statuses = val?.statuses || [];
                for (const st of statuses) {
                    const wamid = st?.id;
                    const status = st?.status; // 'sent', 'delivered', 'read', 'failed'
                    const timestamp = st?.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
                    const recipientId = st?.recipient_id;
                    if (!wamid || !status)
                        continue;
                    // Event deduplication key
                    const eventKey = `wa_status_${wamid}_${status}`;
                    // Check if already processed
                    const existingEvent = await query(`SELECT id FROM provider_event_records WHERE provider = 'WHATSAPP_BUSINESS' AND event_id = $1;`, [eventKey]);
                    if (existingEvent.rows.length > 0) {
                        logger.info({ eventKey, wamid, status, recipientId }, 'Replayed WhatsApp webhook event acknowledged idempotently');
                        return { processed: true, statusCount: 0, duplicate: true };
                    }
                    // Update WhatsApp Messages table
                    let sqlUpdate = `UPDATE whatsapp_messages SET status = $1, updated_at = NOW()`;
                    const params = [status.toUpperCase(), wamid];
                    if (status === 'delivered') {
                        sqlUpdate += `, delivered_at = COALESCE(delivered_at, $3)`;
                        params.push(timestamp);
                    }
                    else if (status === 'read') {
                        sqlUpdate += `, read_at = COALESCE(read_at, $3)`;
                        params.push(timestamp);
                    }
                    else if (status === 'failed') {
                        const errDetails = st?.errors?.[0];
                        const errCode = errDetails?.code ? String(errDetails.code) : 'DELIVERY_FAILED';
                        const errMsg = errDetails?.title || errDetails?.message || 'Message delivery failed';
                        sqlUpdate += `, error_code = $3, error_message = $4`;
                        params.push(errCode, errMsg);
                    }
                    sqlUpdate += ` WHERE wamid = $2 RETURNING notification_record_id, organization_id, customer_id;`;
                    const updateRes = await query(sqlUpdate, params);
                    if (updateRes.rows.length > 0) {
                        const row = updateRes.rows[0];
                        const notifRecordId = row.notification_record_id;
                        // Sync status back to notification_records
                        if (notifRecordId) {
                            await query(`UPDATE notification_records
                 SET status = $1::varchar,
                     delivered_at = CASE WHEN $1::varchar IN ('DELIVERED', 'READ') THEN COALESCE(delivered_at, $2) ELSE delivered_at END,
                     read_at = CASE WHEN $1::varchar = 'READ' THEN COALESCE(read_at, $2) ELSE read_at END,
                     failure_reason = CASE WHEN $1::varchar = 'FAILED' THEN 'Delivery failed by WhatsApp recipient carrier' ELSE failure_reason END,
                     updated_at = NOW()
                 WHERE id = $3;`, [status.toUpperCase(), timestamp, notifRecordId]);
                            // Record in notification delivery logs
                            await query(`INSERT INTO notification_delivery_logs (
                   notification_record_id, channel, provider,
                   provider_message_id, status, response_payload, created_at
                 ) VALUES ($1, 'WHATSAPP', 'META_WHATSAPP_CLOUD', $2, $3, $4, NOW());`, [notifRecordId, wamid, status.toUpperCase(), JSON.stringify(st)]);
                        }
                    }
                    // Record processed event to prevent replay attacks
                    await query(`INSERT INTO provider_event_records (
               provider, event_id, event_type, raw_payload, processed_status, processed_at
             ) VALUES ('WHATSAPP_BUSINESS', $1, $2, $3, 'PROCESSED', NOW())
             ON CONFLICT (provider, event_id) DO NOTHING;`, [eventKey, `STATUS_${status.toUpperCase()}`, JSON.stringify(st)]);
                    statusCount++;
                }
            }
        }
        return { processed: true, statusCount, duplicate: false };
    }
}
//# sourceMappingURL=whatsapp-webhook.handler.js.map