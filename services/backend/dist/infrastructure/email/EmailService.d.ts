export interface ActivationEmailPayload {
    recipientEmail: string;
    adminName: string;
    dairyName: string;
    dairyCode: string;
    adminMobile: string;
    activationUrl: string;
    expiresInHours?: number;
}
export interface EmailDispatchResult {
    success: boolean;
    provider: string;
    messageId?: string;
    status: 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'PENDING';
    error?: string;
    timestamp: string;
    recipient: string;
    previewNote?: string;
}
export declare class EmailService {
    private transporter;
    private isConfigured;
    constructor();
    private initTransporter;
    /**
     * Renders a Claymorphic HTML template for Primary Dairy Admin activation.
     */
    renderClaymorphicActivationTemplate(payload: ActivationEmailPayload): {
        html: string;
        text: string;
    };
    /**
     * Dispatches an activation invitation email to the Primary Dairy Admin.
     */
    sendActivationInvitation(payload: ActivationEmailPayload): Promise<EmailDispatchResult>;
}
export declare const emailService: EmailService;
//# sourceMappingURL=EmailService.d.ts.map