import { Request, Response, NextFunction } from 'express';
export declare class WhatsAppWebhookController {
    /**
     * GET /api/v1/webhooks/whatsapp
     * Meta WhatsApp Webhook Verification Challenge
     */
    static verifyWebhook(req: Request, res: Response, next: NextFunction): Promise<void>;
    /**
     * POST /api/v1/webhooks/whatsapp
     * Incoming WhatsApp Business Delivery Receipts and Status Updates
     */
    static handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=whatsapp-webhook.controller.d.ts.map