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
export declare class CredentialEncryption {
    private static getKey;
    static encrypt(plainText: string): string;
    static decrypt(cipherText: string): string;
}
//# sourceMappingURL=CredentialEncryption.d.ts.map