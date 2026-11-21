import { IOtpService } from '../../application/ports/index.js';
export interface OtpChallengeRecord {
    id: string;
    phone: string;
    otpHash: string;
    expiresAt: number;
    attempts: number;
    isUsed: boolean;
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN';
    lastRequestedAt: number;
    ipAddress?: string;
}
export declare class DoveOtpService implements IOtpService {
    private static readonly OTP_TTL_MS;
    private static readonly RESEND_COOLDOWN_MS;
    private static readonly MAX_ATTEMPTS;
    private readonly memoryStorage;
    private readonly authorizedAdminPhones;
    registerAuthorizedAdminPhone(phone: string): void;
    unregisterAuthorizedAdminPhone(phone: string): void;
    resetCooldown(phone: string): void;
    private getStorageKey;
    private getHmacSecret;
    /**
     * Validates if a phone number is whitelisted for administrative login.
     * Supports both config-whitelisted Super Admins and dynamically activated Dairy Admins.
     */
    isAdminPhoneWhitelisted(phone: string): boolean;
    /**
     * Asynchronously verifies if a phone is registered in DB as an active admin user.
     */
    ensureAdminWhitelisted(phone: string): Promise<boolean>;
    /**
     * Dispatches a real OTP via Dove SMS Gateway with cryptographic generation and HMAC hashing.
     */
    sendOtp(mobileNumber: string, purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN', ipAddress?: string): Promise<{
        success: boolean;
        message: string;
        cooldownSeconds?: number;
        expiresAt?: string;
        previewOtp?: string;
    }>;
    /**
     * Verifies an OTP using timing-safe comparison of HMAC-SHA256 hashes.
     */
    verifyOtp(mobileNumber: string, otp: string, purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'): Promise<boolean>;
}
export declare const doveOtpService: DoveOtpService;
//# sourceMappingURL=DoveOtpService.d.ts.map