import { logger } from '../../shared/logger/index.js';
import { config } from '../../config/env.js';
export class DoveSmsService {
    static instance;
    apiUrl;
    username;
    authKey;
    senderId;
    accusage;
    template;
    constructor() {
        this.apiUrl = config.DOVE_SMS_API_URL || 'https://mobicomm.dove-sms.com/submitsms.jsp';
        this.username = config.DOVE_SMS_USERNAME || 'Experts';
        this.authKey = config.DOVE_SMS_AUTHKEY || 'ba9dcdcdfcXX';
        this.senderId = config.DOVE_SMS_SENDER_ID || 'EXTSKL';
        this.accusage = config.DOVE_SMS_ACCUSAGE || '1';
        this.template = config.DOVE_SMS_TEMPLATE || 'Your Verification Code for login is {OTP}. - Expertskill Technology.';
    }
    static getInstance() {
        if (!DoveSmsService.instance) {
            DoveSmsService.instance = new DoveSmsService();
        }
        return DoveSmsService.instance;
    }
    /**
     * Normalizes mobile number for Indian Dove SMS gateway.
     * Ensures the number is prefixed with '+91' followed by the 10-digit number.
     */
    normalizeMobile(rawPhone) {
        const digits = rawPhone.replace(/\D/g, '');
        const last10 = digits.slice(-10);
        return `+91${last10}`;
    }
    /**
     * Dispatches login / authentication OTP SMS via Dove SMS Gateway (HTTP GET).
     * DLT Approved Template: "Your Verification Code for login is {OTP}. - Expertskill Technology."
     */
    async sendLoginOtpSms(mobile, otp) {
        const normalizedMobile = this.normalizeMobile(mobile);
        const textMessage = this.template.replace('{OTP}', otp);
        const queryParams = new URLSearchParams({
            user: this.username,
            key: this.authKey,
            mobile: normalizedMobile,
            message: textMessage,
            accusage: this.accusage,
            senderid: this.senderId,
        });
        const requestUrl = `${this.apiUrl}?${queryParams.toString()}`;
        const maskedPhone = normalizedMobile.slice(-4).padStart(normalizedMobile.length, '*');
        const executeFetch = async (attempt) => {
            try {
                logger.info({ mobile: maskedPhone, senderId: this.senderId, attempt }, 'Dispatching real SMS via Dove SMS Gateway');
                const response = await fetch(requestUrl, {
                    method: 'GET',
                    headers: {
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    signal: AbortSignal.timeout(12000), // 12 seconds timeout
                });
                const responseText = await response.text();
                logger.info({ status: response.status, responseText: responseText.slice(0, 100), mobile: maskedPhone }, 'Dove SMS Gateway API response received');
                // Check if response indicates success or contains message id
                const lower = responseText.toLowerCase();
                const isSuccess = response.ok && (lower.includes('success') || lower.includes('sent')) && !lower.includes('fail');
                return {
                    success: isSuccess,
                    response: responseText.trim(),
                    messageId: isSuccess ? responseText.trim() : undefined,
                };
            }
            catch (err) {
                if (attempt === 1) {
                    logger.warn({ mobile: maskedPhone, error: err.message }, 'First SMS attempt timed out, retrying once...');
                    return executeFetch(2);
                }
                logger.error({ error: err.message, mobile: maskedPhone }, 'Failed to dispatch SMS via Dove SMS Gateway');
                return {
                    success: false,
                    response: err.message || 'SMS Gateway Network Failure',
                };
            }
        };
        return executeFetch(1);
    }
}
export const doveSmsService = DoveSmsService.getInstance();
//# sourceMappingURL=DoveSmsService.js.map