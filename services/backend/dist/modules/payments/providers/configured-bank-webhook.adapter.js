import crypto from 'node:crypto';
export class ConfiguredBankWebhookAdapter {
    name = 'CONFIGURED_BANK_WEBHOOK';
    secret;
    maxSkewSeconds;
    constructor(config) {
        if (!config.webhookSecret || config.webhookSecret.trim().length < 16) {
            throw new Error('ConfiguredBankWebhookAdapter requires a strong webhookSecret (min 16 chars)');
        }
        this.secret = config.webhookSecret;
        this.maxSkewSeconds = config.maxTimestampSkewSeconds ?? 300; // 5 minutes tolerance
    }
    async submitPayment(payout) {
        return {
            success: true,
            providerTransactionId: `WH-${payout.payoutId.substring(0, 8)}`,
            status: 'SUBMITTED',
            message: 'Payment submitted awaiting gateway webhook settlement notification',
        };
    }
    async verifyPayment(reference) {
        return {
            verified: false,
            status: 'PENDING',
            bankReference: reference,
        };
    }
    async verifyWebhook(payload, signature, timestampHeader) {
        if (!signature) {
            return { isValid: false, error: 'Missing webhook signature header' };
        }
        const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
        // Replay protection: check timestamp if provided
        let eventTime = new Date();
        if (timestampHeader) {
            const tsNum = Number(timestampHeader);
            const parsedTime = !isNaN(tsNum) ? new Date(tsNum * (tsNum > 1e11 ? 1 : 1000)) : new Date(timestampHeader);
            if (!isNaN(parsedTime.getTime())) {
                eventTime = parsedTime;
                const now = Date.now();
                const diffSeconds = Math.abs(now - parsedTime.getTime()) / 1000;
                if (diffSeconds > this.maxSkewSeconds) {
                    return {
                        isValid: false,
                        error: `Webhook timestamp expired or out of bounds (skew: ${diffSeconds.toFixed(1)}s > ${this.maxSkewSeconds}s)`,
                    };
                }
            }
        }
        // Compute expected HMAC SHA-256
        const expectedHmac = crypto.createHmac('sha256', this.secret).update(payloadBuffer).digest('hex');
        // Constant-time signature comparison to prevent timing attacks
        const cleanSig = signature.replace(/^sha256=/i, '').trim();
        if (cleanSig.length !== expectedHmac.length) {
            return { isValid: false, error: 'Invalid webhook signature length' };
        }
        const sigMatches = crypto.timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(expectedHmac, 'hex'));
        if (!sigMatches) {
            return { isValid: false, error: 'Webhook HMAC signature mismatch' };
        }
        try {
            const parsed = JSON.parse(payloadBuffer.toString('utf-8'));
            const eventId = parsed.eventId || parsed.id || parsed.event_id || `evt_${crypto.randomUUID()}`;
            const eventType = parsed.eventType || parsed.event || parsed.type || 'PAYMENT_SETTLED';
            return {
                isValid: true,
                eventId,
                eventType,
                timestamp: eventTime,
                payload: parsed,
            };
        }
        catch (err) {
            return {
                isValid: false,
                error: `Malformed webhook JSON payload: ${err.message}`,
            };
        }
    }
    async checkTransactionStatus(transactionId) {
        return {
            status: 'PENDING',
            transactionId,
        };
    }
}
//# sourceMappingURL=configured-bank-webhook.adapter.js.map