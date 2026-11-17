import crypto from 'node:crypto';
import { IOtpService } from '../../application/ports/index.js';
import { DomainValidationError, UnauthorizedError } from '../../domain/errors/index.js';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
import { doveSmsService } from '../sms/DoveSmsService.js';
import { generateCryptographicOtp, hashOtp, timingSafeOtpEqual } from '../../shared/utils/crypto.js';
import { db } from '../database/PostgresPool.js';

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

export class DoveOtpService implements IOtpService {
  private static readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
  private static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
  private static readonly MAX_ATTEMPTS = 5; // Max 5 wrong attempts before invalidation

  // In-memory fail-safe storage fallback
  private readonly memoryStorage = new Map<string, OtpChallengeRecord>();
  private readonly authorizedAdminPhones = new Set<string>();

  public registerAuthorizedAdminPhone(phone: string): void {
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    if (cleanDigits.length === 10) {
      this.authorizedAdminPhones.add(cleanDigits);
    }
  }

  public unregisterAuthorizedAdminPhone(phone: string): void {
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    this.authorizedAdminPhones.delete(cleanDigits);
    this.memoryStorage.delete(`ADMIN_LOGIN:+91${cleanDigits}`);
    this.memoryStorage.delete(`ADMIN_LOGIN:${cleanDigits}`);
    this.memoryStorage.delete(`OPERATOR_LOGIN:+91${cleanDigits}`);
    this.memoryStorage.delete(`CUSTOMER_AUTH:+91${cleanDigits}`);
  }

  private getStorageKey(phone: string, purpose: string): string {
    return `${purpose}:${phone}`;
  }

  private getHmacSecret(purpose: string): string {
    if (purpose === 'ADMIN_LOGIN') {
      return config.ADMIN_OTP_SECRET || config.JWT_SECRET;
    }
    return config.JWT_SECRET || config.ADMIN_OTP_SECRET;
  }

  /**
   * Validates if a phone number is whitelisted for administrative login.
   * Supports both config-whitelisted Super Admins and dynamically activated Dairy Admins.
   */
  public isAdminPhoneWhitelisted(phone: string): boolean {
    const cleanInput = phone.replace(/\D/g, '');
    const last10 = cleanInput.slice(-10);

    if (this.authorizedAdminPhones.has(last10)) {
      return true;
    }

    const rawWhitelisted = config.ADMIN_PHONE_NUMBER;
    if (!rawWhitelisted) return false;

    const whitelistedNumbers = rawWhitelisted.split(',').map((p) => p.replace(/\D/g, '').trim());

    return whitelistedNumbers.some((allowed) => {
      if (allowed === cleanInput) return true;
      if (allowed.slice(-10) === last10) return true;
      return false;
    });
  }

  /**
   * Asynchronously verifies if a phone is registered in DB as an active admin user.
   */
  public async ensureAdminWhitelisted(phone: string): Promise<boolean> {
    if (this.isAdminPhoneWhitelisted(phone)) return true;
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    try {
      const res = await db.query(
        `SELECT id, role FROM users 
         WHERE phone_number LIKE $1 
           AND status = 'ACTIVE' 
           AND role IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')
         LIMIT 1;`,
        [`%${cleanDigits}`]
      );
      if (res.rows.length > 0) {
        this.registerAuthorizedAdminPhone(cleanDigits);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  /**
   * Dispatches a real OTP via Dove SMS Gateway with cryptographic generation and HMAC hashing.
   */
  public async sendOtp(
    mobileNumber: string,
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN',
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      throw new DomainValidationError('Invalid mobile number format. Must contain at least 10 digits.');
    }

    // 1. Admin phone whitelisting check
    if (purpose === 'ADMIN_LOGIN') {
      const isAllowed = this.isAdminPhoneWhitelisted(mobileNumber);
      if (!isAllowed) {
        logger.warn({ mobileNumber }, 'Unauthorized attempt to request Admin OTP');
        throw new UnauthorizedError('This mobile number is not authorized for Admin access.');
      }
    }

    const key = this.getStorageKey(mobileNumber, purpose);
    const now = Date.now();

    // 2. Rate limiting & Cooldown check (60 seconds)
    const existing = this.memoryStorage.get(key);
    if (existing && !existing.isUsed && now - existing.lastRequestedAt < DoveOtpService.RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((DoveOtpService.RESEND_COOLDOWN_MS - (now - existing.lastRequestedAt)) / 1000);
      throw new DomainValidationError(`Please wait ${waitSeconds} seconds before requesting a new OTP.`);
    }

    // 3. Cryptographically secure 6-digit numeric OTP
    const rawOtp = generateCryptographicOtp();
    const secret = this.getHmacSecret(purpose);
    const otpHash = hashOtp(rawOtp, secret);
    const expiresAt = now + DoveOtpService.OTP_TTL_MS;
    const challengeId = crypto.randomUUID();

    const record: OtpChallengeRecord = {
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
    try {
      const tableName = purpose === 'ADMIN_LOGIN' ? 'admin_otp_challenges' : 'customer_otp_challenges';
      await db.query(
        `INSERT INTO ${tableName} (id, phone, otp_hash, expires_at, attempts, is_used, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO NOTHING;`,
        [challengeId, mobileNumber, otpHash, new Date(expiresAt).toISOString(), 0, false, ipAddress || null]
      );
    } catch {
      // Database connection down or table unmigrated; fail-safe memory storage is active
    }

    // 5. Always keep in in-memory Map for high-speed & fail-safe verification
    this.memoryStorage.set(key, record);

    // 6. Real SMS Dispatch via Dove SMS Gateway (Mobicomm API)
    const isTestMode = process.env['NODE_ENV'] === 'test' || config.ALLOW_TEST_PREVIEW_OTP;
    const smsResult = await doveSmsService.sendLoginOtpSms(mobileNumber, rawOtp);
    if (!smsResult.success && !isTestMode) {
      logger.error({ mobile: mobileNumber, response: smsResult.response }, 'Dove SMS gateway returned failure');
      throw new DomainValidationError(`SMS dispatch failed: ${smsResult.response}`);
    }

    // 7. Preview OTP: ONLY allowed in automated test suites when explicitly configured
    const previewOtp = isTestMode ? rawOtp : undefined;

    const maskedPhone = cleanDigits.slice(-4).padStart(cleanDigits.length, '*');
    return {
      success: true,
      message: `Verification code sent successfully to ${maskedPhone}`,
      previewOtp,
    };
  }

  /**
   * Verifies an OTP using timing-safe comparison of HMAC-SHA256 hashes.
   */
  public async verifyOtp(
    mobileNumber: string,
    otp: string,
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'
  ): Promise<boolean> {
    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return false;
    }

    const key = this.getStorageKey(mobileNumber, purpose);
    let record = this.memoryStorage.get(key);
    const now = Date.now();

    // If not found in memory, attempt DB fetch if available
    if (!record) {
      try {
        const tableName = purpose === 'ADMIN_LOGIN' ? 'admin_otp_challenges' : 'customer_otp_challenges';
        const res = await db.query(
          `SELECT id, phone, otp_hash, expires_at, attempts, is_used, ip_address
           FROM ${tableName}
           WHERE phone = $1 AND is_used = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1;`,
          [mobileNumber]
        );
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
      } catch {
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
        const tableName = purpose === 'ADMIN_LOGIN' ? 'admin_otp_challenges' : 'customer_otp_challenges';
        await db.query(`UPDATE ${tableName} SET is_used = TRUE WHERE id = $1;`, [record.id]);
      } catch {
        // DB offline fallback
      }

      return true;
    }

    return false;
  }
}

export const doveOtpService = new DoveOtpService();
