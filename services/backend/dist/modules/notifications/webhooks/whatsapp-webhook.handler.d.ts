export declare class WhatsAppWebhookHandler {
    /**
     * Verifies Meta WhatsApp Webhook verification challenge (GET request).
     */
    static verifyChallenge(mode: string, verifyToken: string, challenge: string): string;
    /**
     * Verifies HMAC-SHA256 signature from Meta (x-hub-signature-256 header).
     */
    static verifySignature(rawBody: string | Buffer, signatureHeader?: string | null): boolean;
    /**
     * Processes incoming WhatsApp status webhook payload with replay protection and deduplication.
     */
    static processWebhook(rawBody: string | Buffer, signatureHeader: string | null | undefined, payload: any): Promise<{
        processed: boolean;
        statusCount: number;
        duplicate: boolean;
    }>;
}
//# sourceMappingURL=whatsapp-webhook.handler.d.ts.map