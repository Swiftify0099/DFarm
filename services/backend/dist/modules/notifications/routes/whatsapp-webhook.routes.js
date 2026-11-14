import { Router } from 'express';
import { WhatsAppWebhookController } from '../controllers/whatsapp-webhook.controller.js';
export const whatsappWebhookRouter = Router();
// GET for Meta Webhook verification handshake (No authentication required by Meta Cloud API)
whatsappWebhookRouter.get('/', WhatsAppWebhookController.verifyWebhook);
// POST for Meta WhatsApp incoming delivery receipts & status updates (Secured via HMAC-SHA256 signature)
whatsappWebhookRouter.post('/', WhatsAppWebhookController.handleWebhook);
//# sourceMappingURL=whatsapp-webhook.routes.js.map