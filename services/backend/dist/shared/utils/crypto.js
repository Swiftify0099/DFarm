import crypto from 'node:crypto';
/**
 * Generates a cryptographically secure 6-digit numeric OTP (100000 - 999999).
 */
export function generateCryptographicOtp() {
    const code = crypto.randomInt(100000, 1000000);
    return code.toString();
}
/**
 * Computes an HMAC-SHA256 hex digest for an OTP string using a secret key.
 * Ensures the plaintext OTP is never persisted directly in storage.
 */
export function hashOtp(otp, secret) {
    return crypto.createHmac('sha256', secret).update(otp.trim()).digest('hex');
}
/**
 * Compares an incoming plain OTP with a stored HMAC-SHA256 hash
 * using timing-safe buffer comparison to prevent timing side-channel attacks.
 */
export function timingSafeOtpEqual(candidateOtp, expectedHash, secret) {
    const candidateHash = hashOtp(candidateOtp, secret);
    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (candidateBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}
//# sourceMappingURL=crypto.js.map