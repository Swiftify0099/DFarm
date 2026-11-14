import { WhatsAppWebhookHandler } from '../webhooks/whatsapp-webhook.handler.js';
import { WhatsAppWebhookVerificationSchema } from '@dfarm/shared-validation';
export class WhatsAppWebhookController {
    /**
     * GET /api/v1/webhooks/whatsapp
     * Meta WhatsApp Webhook Verification Challenge
     */
    static async verifyWebhook(req, res, next) {
        try {
            const validated = WhatsAppWebhookVerificationSchema.parse(req.query);
            const challenge = WhatsAppWebhookHandler.verifyChallenge(validated['hub.mode'], validated['hub.verify_token'], validated['hub.challenge']);
            res.status(200).send(challenge);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * POST /api/v1/webhooks/whatsapp
     * Incoming WhatsApp Business Delivery Receipts and Status Updates
     */
    static async handleWebhook(req, res, next) {
        try {
            const signature = req.headers['x-hub-signature-256'];
            const rawBody = req.rawBody || JSON.stringify(req.body);
            const result = await WhatsAppWebhookHandler.processWebhook(rawBody, signature, req.body);
            res.status(200).json({ status: 'EVENT_RECEIVED', ...result });
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=whatsapp-webhook.controller.js.map