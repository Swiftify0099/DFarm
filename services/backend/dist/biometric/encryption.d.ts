import { EncryptedBiometricTemplate } from '@dfarm/shared-types';
export declare class BiometricSecurityError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(code: string, message: string, details?: unknown | undefined);
}
export interface EncryptionContext {
    customerId: string;
    modelVersionId: string;
}
export declare class BiometricEncryptionEngine {
    private static readonly ALGORITHM;
    private static readonly IV_LENGTH_BYTES;
    private static readonly AUTH_TAG_LENGTH_BYTES;
    static readonly EXPECTED_EMBEDDING_DIM = 512;
    private readonly masterKey;
    readonly keyReference: string;
    constructor(keyHex?: string, keyReference?: string);
    /**
     * Serialize a floating point vector (Float32Array or number[]) to a raw binary Buffer.
     */
    serializeVector(vector: number[] | Float32Array): Buffer;
    /**
     * Deserialize a raw binary Buffer back to a Float32Array.
     */
    deserializeVector(buffer: Buffer): Float32Array;
    /**
     * Encrypt a facial embedding vector using AES-256-GCM with Additional Authenticated Data (AAD).
     * AAD binds the Customer ID and Model Version ID directly into the cryptographic auth tag,
     * preventing template transplantation attacks across different customers or models.
     */
    encryptTemplate(vector: number[] | Float32Array, context: EncryptionContext): EncryptedBiometricTemplate;
    /**
     * Decrypt an encrypted biometric template and verify authentication tag and AAD bindings.
     * Throws AUTHENTICATION_TAG_VERIFICATION_FAILED if ciphertext, tag, IV, or AAD is tampered.
     */
    decryptTemplate(template: EncryptedBiometricTemplate, context: EncryptionContext): Float32Array;
    /**
     * Secure zeroization of a float array in memory.
     */
    zeroizeVector(vector: Float32Array): void;
}
//# sourceMappingURL=encryption.d.ts.map