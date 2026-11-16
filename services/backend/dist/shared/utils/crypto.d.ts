/**
 * Generates a cryptographically secure 6-digit numeric OTP (100000 - 999999).
 */
export declare function generateCryptographicOtp(): string;
/**
 * Computes an HMAC-SHA256 hex digest for an OTP string using a secret key.
 * Ensures the plaintext OTP is never persisted directly in storage.
 */
export declare function hashOtp(otp: string, secret: string): string;
/**
 * Compares an incoming plain OTP with a stored HMAC-SHA256 hash
 * using timing-safe buffer comparison to prevent timing side-channel attacks.
 */
export declare function timingSafeOtpEqual(candidateOtp: string, expectedHash: string, secret: string): boolean;
//# sourceMappingURL=crypto.d.ts.map