import { NotificationChannel } from '@dfarm/shared-types';
import { config } from '../../../config/env.js';
import { normalizeE164Phone, maskPhoneNumber } from '../../../shared/utils/phone.js';
import { logger } from '../../../shared/logger/index.js';
import { query } from '../../../db.js';
export class WhatsAppBusinessProvider {
    channel = NotificationChannel.WHATSAPP;
    name = 'META_WHATSAPP_CLOUD';
    async send(record, rendered, variables = {}) {
        const startTime = Date.now();
        // 1. Validate customer phone number
        let normalizedPhone;
        try {
            if (!record.recipientPhone) {
                throw new Error('Customer phone number is missing');
            }
            normalizedPhone = normalizeE164Phone(record.recipientPhone);
        }
        catch (err) {
            logger.warn({ customerId: record.customerId, error: err.message }, 'WhatsApp dispatch rejected: invalid phone number');
            return {
                success: false,
                provider: this.name,
                status: 'FAILED',
                errorCode: 'INVALID_PHONE_NUMBER',
                errorMessage: err.message || 'Invalid recipient phone number',
                latencyMs: Date.now() - startTime,
            };
        }
        const maskedPhone = maskPhoneNumber(normalizedPhone);
        // 2. Check provider credentials
        const isConfigured = Boolean(config.WHATSAPP_ACCESS_TOKEN) &&
            Boolean(config.WHATSAPP_PHONE_NUMBER_ID) &&
            config.WHATSAPP_ACCESS_TOKEN !== 'placeholder_whatsapp_access_token' &&
            config.WHATSAPP_PHONE_NUMBER_ID !== 'placeholder_whatsapp_phone_number_id';
        if (!isConfigured || !config.WHATSAPP_ENABLED) {
            logger.info({
                customerId: record.customerId,
                recipient: maskedPhone,
                configured: isConfigured,
                enabled: config.WHATSAPP_ENABLED,
            }, 'WhatsApp integration BLOCKED: Real credentials not configured in environment');
            return {
                success: false,
                provider: this.name,
                status: 'BLOCKED',
                errorCode: 'WHATSAPP_CREDENTIALS_MISSING',
                errorMessage: 'Actual WhatsApp Business Cloud API credentials not configured. Mocking success prohibited by DFarm safety rules.',
                latencyMs: Date.now() - startTime,
            };
        }
        // 3. Construct WhatsApp Cloud API Payload
        // Format recipient without the leading '+' for WhatsApp Graph API recipient
        const recipientWaId = normalizedPhone.replace(/^\+/, '');
        const apiUrl = `${config.WHATSAPP_API_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        // Map template parameters
        const templateName = rendered.whatsappTemplateName || 'dfarm_notification_generic';
        const bodyParameters = Object.entries(variables).map(([, v]) => ({
            type: 'text',
            text: String(v),
        }));
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientWaId,
            type: 'template',
            template: {
                name: templateName,
                language: { code: rendered.language },
                components: [
                    {
                        type: 'body',
                        parameters: bodyParameters.length > 0 ? bodyParameters : [{ type: 'text', text: rendered.body }],
                    },
                ],
            },
        };
        // 4. Send request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - startTime;
            const resJson = (await response.json().catch(() => ({})));
            if (!response.ok) {
                const errorMsg = resJson.error?.message || `WhatsApp API error ${response.status}`;
                const errorCode = resJson.error?.code ? String(resJson.error.code) : 'WHATSAPP_API_ERROR';
                logger.error({ recipient: maskedPhone, status: response.status, errorCode, errorMsg }, 'WhatsApp Cloud API delivery failed');
                // Record failed message in audit table
                await this.recordMessage({
                    organizationId: record.organizationId,
                    customerId: record.customerId,
                    notificationRecordId: record.id,
                    phoneNumber: normalizedPhone,
                    templateName,
                    status: 'FAILED',
                    payload,
                    errorCode,
                    errorMessage: errorMsg,
                });
                return {
                    success: false,
                    provider: this.name,
                    status: 'FAILED',
                    responseCode: response.status,
                    rawResponse: resJson,
                    errorCode,
                    errorMessage: errorMsg,
                    latencyMs,
                };
            }
            const wamid = resJson.messages?.[0]?.id;
            logger.info({ recipient: maskedPhone, wamid, latencyMs }, 'WhatsApp message dispatched successfully via Cloud API');
            // Record outbound message in audit table
            await this.recordMessage({
                organizationId: record.organizationId,
                customerId: record.customerId,
                notificationRecordId: record.id,
                wamid,
                phoneNumber: normalizedPhone,
                templateName,
                status: 'SENT',
                payload,
            });
            return {
                success: true,
                provider: this.name,
                providerMessageId: wamid,
                status: 'SENT',
                responseCode: response.status,
                rawResponse: resJson,
                latencyMs,
            };
        }
        catch (err) {
            clearTimeout(timeout);
            const latencyMs = Date.now() - startTime;
            const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('aborted');
            logger.error({ recipient: maskedPhone, error: err.message, isTimeout }, 'WhatsApp request exception');
            return {
                success: false,
                provider: this.name,
                status: 'FAILED',
                errorCode: isTimeout ? 'PROVIDER_TIMEOUT' : 'NETWORK_ERROR',
                errorMessage: isTimeout ? 'WhatsApp Cloud API request timed out after 8s' : err.message,
                latencyMs,
            };
        }
    }
    async recordMessage(msg) {
        try {
            await query(`INSERT INTO whatsapp_messages (
           organization_id, customer_id, notification_record_id,
           wamid, phone_number, template_name, message_type,
           status, payload, error_code, error_message, sent_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'TEMPLATE', $7, $8, $9, $10, NOW())
         ON CONFLICT (wamid) DO NOTHING;`, [
                msg.organizationId,
                msg.customerId,
                msg.notificationRecordId || null,
                msg.wamid || null,
                msg.phoneNumber,
                msg.templateName || null,
                msg.status,
                JSON.stringify(msg.payload || {}),
                msg.errorCode || null,
                msg.errorMessage || null,
            ]);
        }
        catch (err) {
            logger.error({ error: err.message }, 'Failed to record whatsapp_message row');
        }
    }
}
//# sourceMappingURL=whatsapp.provider.js.map