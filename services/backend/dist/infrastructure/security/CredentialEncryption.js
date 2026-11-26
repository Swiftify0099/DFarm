import crypto from 'node:crypto';
import { config, validateKeyEntropyAndByteLength } from '../../config/env.js';
/**
 * AES-256-GCM Envelope Encryption for Tenant Database Credentials & URIs
 *
 * Requirements:
 * - 256-bit encryption key derived via SHA-256 from TENANT_DB_ENCRYPTION_KEY
 * - 96-bit (12-byte) cryptographically secure random initialization vector (IV) per encryption
 * - 128-bit (16-byte) authentication tag ensuring ciphertext integrity & authenticity
 * - Format: `${ivHex}:${authTagHex}:${cipherTextHex}`
 * - Zero plaintext credentials in application logs or REST responses
 */
export class CredentialEncryption {
    static getKey() {
        const isProduction = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
        const rawKey = process.env['TENANT_DB_ENCRYPTION_KEY'] || config.TENANT_DB_ENCRYPTION_KEY;
        if (isProduction) {
            if (!rawKey || rawKey === 'dfarm-super-secret-encryption-key-32chars!') {
                throw new Error('CRITICAL: Production TENANT_DB_ENCRYPTION_KEY must be explicitly configured.');
            }
            validateKeyEntropyAndByteLength(rawKey, 'TENANT_DB_ENCRYPTION_KEY');
        }
        if (!rawKey) {
            throw new Error('CRITICAL: TENANT_DB_ENCRYPTION_KEY is missing.');
        }
        return crypto.createHash('sha256').update(rawKey).digest();
    }
    static encrypt(plainText) {
        if (!plainText) {
            throw new Error('Cannot encrypt empty or null credential string');
        }
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
        const encrypted = Buffer.concat([
            cipher.update(plainText, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    }
    static decrypt(cipherText) {
        if (!cipherText) {
            throw new Error('Cannot decrypt empty or null ciphertext');
        }
        const parts = cipherText.split(':');
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
            throw new Error('Invalid encrypted credential format. Expected iv:authTag:ciphertext');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedData = Buffer.from(parts[2], 'hex');
        if (iv.length !== 12) {
            throw new Error(`Invalid initialization vector length: expected 12 bytes, got ${iv.length}`);
        }
        if (authTag.length !== 16) {
            throw new Error(`Invalid authentication tag length: expected 16 bytes, got ${authTag.length}`);
        }
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }
}
//# sourceMappingURL=CredentialEncryption.js.map