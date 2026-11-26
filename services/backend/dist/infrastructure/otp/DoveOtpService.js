import crypto from 'node:crypto';
import { DomainError, DomainValidationError, UnauthorizedError } from '../../domain/errors/index.js';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
import { doveSmsService } from '../sms/DoveSmsService.js';
import { generateCryptographicOtp, hashOtp, timingSafeOtpEqual } from '../../shared/utils/crypto.js';
import { db } from '../database/PostgresPool.js';
export const ALLOWED_ADMIN_ROLES = new Set([
    'SUPER_ADMIN',
    'PLATFORM_OPERATOR',
    'PRIMARY_DAIRY_ADMIN',
    'DAIRY_ADMIN',
    'DAIRY_OWNER',
    'CENTER_MANAGER',
]);
export const PLATFORM_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'PLATFORM_OPERATOR']);
export class DoveOtpService {
    smsService;
    static OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
    static RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
    static MAX_ATTEMPTS = 5; // Max 5 wrong attempts before invalidation
    // In-memory fail-safe storage fallback
    memoryStorage = new Map();
    constructor(smsService = doveSmsService) {
        this.smsService = smsService;
    }
    static isProductionRuntime() {
        return config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
    }
    static isStrictTestMode() {
        return !DoveOtpService.isProductionRuntime() && process.env['NODE_ENV'] === 'test';
    }
    registerAuthorizedAdminPhone(_phone) {
        // Deprecated no-op: Administrator authorization is strictly resolved via persisted database records.
    }
    unregisterAuthorizedAdminPhone(phone) {
        const cleanDigits = phone.replace(/\D/g, '').slice(-10);
        this.memoryStorage.delete(`ADMIN_LOGIN:+91${cleanDigits}`);
        this.memoryStorage.delete(`ADMIN_LOGIN:${cleanDigits}`);
        this.memoryStorage.delete(`OPERATOR_LOGIN:+91${cleanDigits}`);
        this.memoryStorage.delete(`CUSTOMER_AUTH:+91${cleanDigits}`);
    }
    resetCooldown(phone) {
        const cleanDigits = phone.replace(/\D/g, '').slice(-10);
        this.memoryStorage.delete(`ADMIN_LOGIN:+91${cleanDigits}`);
        this.memoryStorage.delete(`ADMIN_LOGIN:${cleanDigits}`);
        this.memoryStorage.delete(`OPERATOR_LOGIN:+91${cleanDigits}`);
        this.memoryStorage.delete(`CUSTOMER_AUTH:+91${cleanDigits}`);
        this.memoryStorage.delete(`CUSTOMER_AUTH:${cleanDigits}`);
    }
    getStorageKey(phone, purpose) {
        return `${purpose}:${phone}`;
    }
    maskPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 4)
            return '****';
        return digits.slice(-4).padStart(digits.length, '*');
    }
    getHmacSecret(purpose) {
        const isProduction = DoveOtpService.isProductionRuntime();
        if (purpose === 'ADMIN_LOGIN') {
            const secret = process.env['ADMIN_OTP_SECRET'] || config.ADMIN_OTP_SECRET;
            if (isProduction && (!secret || secret === 'dfarm-super-secure-admin-otp-secret-key-32chars!')) {
                throw new Error('CRITICAL: Production ADMIN_OTP_SECRET is missing or insecure.');
            }
            return secret || config.JWT_SECRET;
        }
        const secret = process.env['JWT_SECRET'] || config.JWT_SECRET;
        if (isProduction && (!secret || secret === 'super-secret-jwt-token-with-at-least-32-characters-long')) {
            throw new Error('CRITICAL: Production JWT_SECRET is missing or insecure.');
        }
        return secret;
    }
    /**
     * Deprecated synchronous check: always returns false so callers must use DB-backed async verification.
     */
    isAdminPhoneWhitelisted(_phone) {
        return false;
    }
    /**
     * Authoritatively verifies if a phone belongs to an active administrator in the persisted database.
     * Fails closed on any database error or inactive/non-admin record.
     */
    async ensureAdminWhitelisted(phone) {
        const cleanDigits = phone.replace(/\D/g, '').slice(-10);
        if (!cleanDigits || cleanDigits.length < 10)
            return false;
        const e164 = `+91${cleanDigits}`;
        try {
            const res = await db.query(`SELECT
           u.id,
           u.organization_id,
           u.role AS base_role,
           u.user_role AS secondary_role,
           u.status AS user_status,
           o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE (u.normalized_mobile_number = $1
             OR u.phone_number = $1
             OR u.mobile_number = $1
             OR u.normalized_mobile_number LIKE $2
             OR u.phone_number LIKE $2
             OR u.mobile_number LIKE $2)
         ORDER BY
           (CASE WHEN UPPER(COALESCE(u.status, '')) = 'ACTIVE' THEN 1 ELSE 2 END),
           (CASE
              WHEN UPPER(COALESCE(u.user_role, u.role, '')) = 'SUPER_ADMIN' THEN 1
              WHEN UPPER(COALESCE(u.user_role, u.role, '')) IN ('PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN') THEN 2
              ELSE 3
            END)
         LIMIT 1;`, [e164, `%${cleanDigits}`]);
            if (res.rows.length === 0) {
                return false;
            }
            const row = res.rows[0];
            if (String(row.user_status || '').toUpperCase() !== 'ACTIVE') {
                return false;
            }
            const candidates = [row.secondary_role, row.base_role]
                .filter((r) => typeof r === 'string' && r.trim().length > 0)
                .map((r) => r.trim().toUpperCase());
            const resolvedRole = candidates.find((r) => ALLOWED_ADMIN_ROLES.has(r));
            if (!resolvedRole) {
                return false;
            }
            if (!PLATFORM_ADMIN_ROLES.has(resolvedRole)) {
                if (!row.organization_id || String(row.org_status || '').toUpperCase() !== 'ACTIVE') {
                    return false;
                }
            }
            return true;
        }
        catch (err) {
            logger.error({ mobile: this.maskPhone(phone), error: err?.message }, 'Admin DB authorization lookup failed');
            return false;
        }
    }
    /**
     * Dispatches a real OTP via Dove SMS Gateway with cryptographic generation and HMAC hashing.
     */
    async sendOtp(mobileNumber, purpose, ipAddress, options) {
        const cleanDigits = mobileNumber.replace(/\D/g, '');
        if (cleanDigits.length < 10) {
            throw new DomainValidationError('Invalid mobile number format. Must contain at least 10 digits.');
        }
        const maskedPhone = this.maskPhone(mobileNumber);
        // 1. Admin authorization check strictly against persisted records
        if (purpose === 'ADMIN_LOGIN') {
            let isAllowed = false;
            if (options?.verifiedInvitationId) {
                isAllowed = true;
            }
            else {
                isAllowed = await this.ensureAdminWhitelisted(mobileNumber);
            }
            if (!isAllowed) {
                logger.warn({ mobile: maskedPhone }, 'Unauthorized attempt to request Admin OTP');
                throw new UnauthorizedError('This mobile number is not authorized for Admin access.');
            }
        }
        const key = this.getStorageKey(mobileNumber, purpose);
        const now = Date.now();
        // 2. Distributed Atomic Cooldown & Rate Limiting Check (60 seconds across all backend instances)
        try {
            const cooldownRes = await db.query(`SELECT last_requested_at, 
                EXTRACT(EPOCH FROM (NOW() - last_requested_at))::integer AS elapsed_seconds
         FROM otp_rate_limits
         WHERE phone = $1;`, [mobileNumber]);
            if (cooldownRes.rows.length > 0) {
                const elapsed = cooldownRes.rows[0].elapsed_seconds;
                if (typeof elapsed === 'number' && elapsed < 60) {
                    const waitSeconds = 60 - elapsed;
                    throw new DomainValidationError(`Please wait ${waitSeconds} seconds before requesting a new OTP.`);
                }
            }
            // Atomically reserve / update cooldown timestamp in PostgreSQL
            await db.query(`INSERT INTO otp_rate_limits (phone, purpose, last_requested_at, request_count, ip_address)
         VALUES ($1, $2, NOW(), 1, $3)
         ON CONFLICT (phone) DO UPDATE
         SET last_requested_at = NOW(),
             purpose = EXCLUDED.purpose,
             request_count = otp_rate_limits.request_count + 1,
             ip_address = EXCLUDED.ip_address;`, [mobileNumber, purpose, ipAddress || null]);
        }
        catch (err) {
            if (err instanceof DomainValidationError)
                throw err;
            // In-memory fallback if database table is unmigrated or in offline unit test mode
            const existing = this.memoryStorage.get(key);
            if (existing && !existing.isUsed && now - existing.lastRequestedAt < DoveOtpService.RESEND_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((DoveOtpService.RESEND_COOLDOWN_MS - (now - existing.lastRequestedAt)) / 1000);
                throw new DomainValidationError(`Please wait ${waitSeconds} seconds before requesting a new OTP.`);
            }
        }
        // 3. Cryptographically secure 6-digit numeric OTP
        const rawOtp = generateCryptographicOtp();
        const secret = this.getHmacSecret(purpose);
        const otpHash = hashOtp(rawOtp, secret);
        const expiresAt = now + DoveOtpService.OTP_TTL_MS;
        const challengeId = crypto.randomUUID();
        const record = {
            id: challengeId,
            phone: mobileNumber,
            otpHash,
            expiresAt,
            attempts: 0,
            isUsed: false,
            purpose,
            lastRequestedAt: now,
            ipAddress,
        };
        // 4. Primary storage: Try database persistence (admin_otp_challenges / customer_otp_challenges)
        const tableName = purpose === 'ADMIN_LOGIN' ? 'admin_otp_challenges' : 'customer_otp_challenges';
        try {
            await db.query(`INSERT INTO ${tableName} (id, phone, otp_hash, expires_at, attempts, is_used, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO NOTHING;`, [challengeId, mobileNumber, otpHash, new Date(expiresAt).toISOString(), 0, false, ipAddress || null]);
        }
        catch {
            // Database connection down or table unmigrated; fail-safe memory storage is active
        }
        // 5. Always keep in in-memory Map for high-speed & fail-safe verification
        this.memoryStorage.set(key, record);
        // 6. Real SMS Dispatch via Dove SMS Gateway (skipped only in isolated NODE_ENV === 'test' when using default gateway)
        const isProduction = DoveOtpService.isProductionRuntime();
        const isStrictTest = DoveOtpService.isStrictTestMode();
        if (isProduction && config.ALLOW_TEST_PREVIEW_OTP) {
            logger.warn('ALLOW_TEST_PREVIEW_OTP flag ignored and overridden in production mode.');
        }
        const shouldDispatchSms = isProduction || !isStrictTest || this.smsService !== doveSmsService;
        if (shouldDispatchSms) {
            const smsResult = await this.smsService.sendLoginOtpSms(mobileNumber, rawOtp);
            if (!smsResult.success) {
                // Do not leave a live challenge or cooldown lock when SMS delivery failed
                this.memoryStorage.delete(key);
                try {
                    await db.query(`DELETE FROM ${tableName} WHERE id = $1;`, [challengeId]);
                }
                catch {
                    // ignore cleanup failure
                }
                try {
                    await db.query(`DELETE FROM otp_rate_limits WHERE phone = $1;`, [mobileNumber]);
                }
                catch {
                    // ignore cleanup failure
                }
                logger.error({ mobile: maskedPhone }, 'Dove SMS gateway returned failure during OTP dispatch');
                throw new DomainError('Failed to deliver verification code via SMS gateway. Please try again later.', 'SMS_DISPATCH_FAILED', 502);
            }
        }
        // 7. Preview OTP: Strictly isolated to NODE_ENV === 'test' (never returned in production or development)
        const response = {
            success: true,
            message: `Verification code sent successfully to ${maskedPhone}`,
            cooldownSeconds: 60,
            expiresAt: new Date(expiresAt).toISOString(),
        };
        if (isStrictTest) {
            response.previewOtp = rawOtp;
        }
        return response;
    }
    /**
     * Verifies an OTP using timing-safe comparison of HMAC-SHA256 hashes.
     */
    async verifyOtp(mobileNumber, otp, purpose) {
        if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
            return false;
        }
        const key = this.getStorageKey(mobileNumber, purpose);
        let record = this.memoryStorage.get(key);
        const now = Date.now();
        const tableName = purpose === 'ADMIN_LOGIN' ? 'admin_otp_challenges' : 'customer_otp_challenges';
        // If not found in memory, attempt DB fetch if available
        if (!record) {
            try {
                const res = await db.query(`SELECT id, phone, otp_hash, expires_at, attempts, is_used, ip_address
           FROM ${tableName}
           WHERE phone = $1 AND is_used = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1;`, [mobileNumber]);
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    record = {
                        id: row.id,
                        phone: row.phone,
                        otpHash: row.otp_hash,
                        expiresAt: new Date(row.expires_at).getTime(),
                        attempts: Number(row.attempts || 0),
                        isUsed: Boolean(row.is_used),
                        purpose,
                        lastRequestedAt: now,
                        ipAddress: row.ip_address,
                    };
                    this.memoryStorage.set(key, record);
                }
            }
            catch {
                // DB fallback ignored
            }
        }
        if (!record || record.isUsed) {
            return false;
        }
        // Expiry check (5 minutes)
        if (now > record.expiresAt) {
            this.memoryStorage.delete(key);
            return false;
        }
        // Max attempts check (5 attempts)
        if (record.attempts >= DoveOtpService.MAX_ATTEMPTS) {
            this.memoryStorage.delete(key);
            throw new DomainValidationError('Maximum OTP verification attempts exceeded. Please request a new OTP.');
        }
        record.attempts++;
        // Timing-Safe HMAC-SHA256 comparison
        const secret = this.getHmacSecret(purpose);
        const isValid = timingSafeOtpEqual(otp.trim(), record.otpHash, secret);
        if (isValid) {
            record.isUsed = true;
            this.memoryStorage.delete(key);
            // Mark used in DB if possible
            try {
                await db.query(`UPDATE ${tableName} SET is_used = TRUE WHERE id = $1;`, [record.id]);
            }
            catch {
                // DB offline fallback
            }
            return true;
        }
        try {
            await db.query(`UPDATE ${tableName} SET attempts = attempts + 1 WHERE id = $1;`, [record.id]);
        }
        catch {
            // DB offline fallback
        }
        return false;
    }
}
export const doveOtpService = new DoveOtpService();
//# sourceMappingURL=DoveOtpService.js.map