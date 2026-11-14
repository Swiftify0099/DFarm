import { NotificationChannel } from '@dfarm/shared-types';
import { config } from '../../../config/env.js';
import { logger } from '../../../shared/logger/index.js';
import { query } from '../../../db.js';
export class FirebaseFcmProvider {
    channel = NotificationChannel.PUSH;
    name = 'FIREBASE_FCM';
    async send(record, rendered, variables = {}) {
        const startTime = Date.now();
        // 1. Verify recipient FCM token
        if (!record.recipientToken || record.recipientToken.trim().length < 10) {
            return {
                success: false,
                provider: this.name,
                status: 'FAILED',
                errorCode: 'INVALID_TOKEN',
                errorMessage: 'Recipient device token is missing or malformed',
                latencyMs: Date.now() - startTime,
            };
        }
        // 2. Check Firebase configuration
        const isConfigured = Boolean(config.FCM_PROJECT_ID) &&
            Boolean(config.FCM_CLIENT_EMAIL) &&
            Boolean(config.FCM_PRIVATE_KEY) &&
            !config.FCM_CLIENT_EMAIL?.includes('firebase-adminsdk@dfarm-smart-dairy.iam.gserviceaccount.com');
        if (!isConfigured) {
            logger.info({ customerId: record.customerId, configured: isConfigured }, 'FCM Push notification BLOCKED: Real Firebase service credentials not configured in environment');
            return {
                success: false,
                provider: this.name,
                status: 'BLOCKED',
                errorCode: 'FCM_NOT_CONFIGURED',
                errorMessage: 'Actual Firebase Cloud Messaging service credentials not configured. Mocking success prohibited by DFarm safety rules.',
                latencyMs: Date.now() - startTime,
            };
        }
        // 3. Real FCM v1 HTTP API Dispatch (when real credentials provided)
        const token = record.recipientToken;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            // In real deployment with active google-auth / service account:
            // An access token is exchanged via JWT assertion and posted to:
            // https://fcm.googleapis.com/v1/projects/${config.FCM_PROJECT_ID}/messages:send
            const fcmUrl = `https://fcm.googleapis.com/v1/projects/${config.FCM_PROJECT_ID}/messages:send`;
            const payload = {
                message: {
                    token,
                    notification: {
                        title: rendered.title,
                        body: rendered.body,
                    },
                    data: {
                        eventId: record.eventId,
                        eventType: record.eventType,
                        customerId: record.customerId,
                        ...Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, String(v)])),
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            channelId: 'dfarm_critical_alerts',
                        },
                    },
                },
            };
            const response = await fetch(fcmUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.FCM_PRIVATE_KEY}`, // Or exchanged OAuth2 token
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - startTime;
            const resJson = (await response.json().catch(() => ({})));
            if (!response.ok) {
                const errorMsg = resJson.error?.message || `FCM delivery error ${response.status}`;
                const errorCode = resJson.error?.details?.[0]?.errorCode || resJson.error?.status || 'FCM_ERROR';
                // Check if token has become invalid / unregistered
                if (errorCode === 'UNREGISTERED' ||
                    errorMsg.includes('Requested entity was not found') ||
                    errorMsg.includes('not a valid FCM registration token')) {
                    logger.warn({ token: token.slice(0, 10) + '...' }, 'Deactivating invalid FCM device token');
                    await this.deactivateInvalidToken(token, errorMsg);
                }
                return {
                    success: false,
                    provider: this.name,
                    status: 'FAILED',
                    responseCode: response.status,
                    rawResponse: resJson,
                    errorCode: errorCode === 'UNREGISTERED' ? 'INVALID_TOKEN' : errorCode,
                    errorMessage: errorMsg,
                    latencyMs,
                };
            }
            const messageId = resJson.name; // e.g. projects/dfarm-smart-dairy/messages/12345
            return {
                success: true,
                provider: this.name,
                providerMessageId: messageId,
                status: 'SENT',
                responseCode: response.status,
                rawResponse: resJson,
                latencyMs,
            };
        }
        catch (err) {
            clearTimeout(timeout);
            const latencyMs = Date.now() - startTime;
            const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
            return {
                success: false,
                provider: this.name,
                status: 'FAILED',
                errorCode: isTimeout ? 'PROVIDER_TIMEOUT' : 'NETWORK_ERROR',
                errorMessage: isTimeout ? 'FCM request timed out after 8s' : err.message,
                latencyMs,
            };
        }
    }
    async deactivateInvalidToken(fcmToken, reason) {
        try {
            await query(`UPDATE customer_device_tokens
         SET is_active = FALSE,
             deactivated_at = NOW(),
             deactivation_reason = $1,
             updated_at = NOW()
         WHERE fcm_token = $2;`, [`INVALID_TOKEN: ${reason}`, fcmToken]);
        }
        catch (err) {
            logger.error({ error: err.message }, 'Failed to deactivate invalid FCM token');
        }
    }
}
//# sourceMappingURL=fcm.provider.js.map