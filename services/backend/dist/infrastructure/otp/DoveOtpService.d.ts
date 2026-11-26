import { IOtpService } from '../../application/ports/index.js';
import { DoveSmsService } from '../sms/DoveSmsService.js';
export declare const ALLOWED_ADMIN_ROLES: Set<string>;
export declare const PLATFORM_ADMIN_ROLES: Set<string>;
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
export interface SendOtpOptions {
    verifiedInvitationId?: string;
}
export declare class DoveOtpService implements IOtpService {
    private readonly smsService;
    private static readonly OTP_TTL_MS;
    private static readonly RESEND_COOLDOWN_MS;
    private static readonly MAX_ATTEMPTS;
    private readonly memoryStorage;
    constructor(smsService?: Pick<DoveSmsService, 'sendLoginOtpSms'>);
    static isProductionRuntime(): boolean;
    static isStrictTestMode(): boolean;
    registerAuthorizedAdminPhone(_phone: string): void;
    unregisterAuthorizedAdminPhone(phone: string): void;
    resetCooldown(phone: string): void;
    private getStorageKey;
    private maskPhone;
    private getHmacSecret;
    /**
     * Deprecated synchronous check: always returns false so callers must use DB-backed async verification.
     */
    isAdminPhoneWhitelisted(_phone: string): boolean;
    /**
     * Authoritatively verifies if a phone belongs to an active administrator in the persisted database.
     * Fails closed on any database error or inactive/non-admin record.
     */
    ensureAdminWhitelisted(phone: string): Promise<boolean>;
    /**
     * Dispatches a real OTP via Dove SMS Gateway with cryptographic generation and HMAC hashing.
     */
    sendOtp(mobileNumber: string, purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN', ipAddress?: string, options?: SendOtpOptions): Promise<{
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