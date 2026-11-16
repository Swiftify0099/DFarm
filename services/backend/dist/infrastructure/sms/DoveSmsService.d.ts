export interface SmsSendResult {
    success: boolean;
    messageId?: string;
    response: string;
}
export declare class DoveSmsService {
    private static instance;
    private readonly apiUrl;
    private readonly username;
    private readonly authKey;
    private readonly senderId;
    private readonly accusage;
    private readonly template;
    constructor();
    static getInstance(): DoveSmsService;
    /**
     * Normalizes mobile number for Indian Dove SMS gateway.
     * Ensures the number is prefixed with '+91' followed by the 10-digit number.
     */
    normalizeMobile(rawPhone: string): string;
    /**
     * Dispatches login / authentication OTP SMS via Dove SMS Gateway (HTTP GET).
     * DLT Approved Template: "Your Verification Code for login is {OTP}. - Expertskill Technology."
     */
    sendLoginOtpSms(mobile: string, otp: string): Promise<SmsSendResult>;
}
export declare const doveSmsService: DoveSmsService;
//# sourceMappingURL=DoveSmsService.d.ts.map