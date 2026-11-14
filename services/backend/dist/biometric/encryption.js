// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRIC SECURITY & TEMPLATE ENCRYPTION ENGINE (AES-256-GCM)
// ==============================================================================
import crypto from 'node:crypto';
export class BiometricSecurityError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'BiometricSecurityError';
    }
}
export class BiometricEncryptionEngine {
    static ALGORITHM = 'aes-256-gcm';
    static IV_LENGTH_BYTES = 12; // 96 bits standard for GCM
    static AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
    static EXPECTED_EMBEDDING_DIM = 512;
    masterKey;
    keyReference;
    constructor(keyHex, keyReference = 'key-v1-2026') {
        const rawKeyHex = keyHex || process.env.DATA_ENCRYPTION_KEY_HEX || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (!rawKeyHex || rawKeyHex.length !== 64) {
            throw new BiometricSecurityError('INVALID_MASTER_KEY', 'Data encryption key must be a 64-character hex string representing a 256-bit AES key.');
        }
        this.masterKey = Buffer.from(rawKeyHex, 'hex');
        this.keyReference = keyReference;
    }
    /**
     * Serialize a floating point vector (Float32Array or number[]) to a raw binary Buffer.
     */
    serializeVector(vector) {
        const floatArray = vector instanceof Float32Array ? vector : new Float32Array(vector);
        const view = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
        const copy = Buffer.alloc(view.length);
        view.copy(copy);
        return copy;
    }
    /**
     * Deserialize a raw binary Buffer back to a Float32Array.
     */
    deserializeVector(buffer) {
        if (buffer.length % 4 !== 0) {
            throw new BiometricSecurityError('INVALID_VECTOR_BUFFER_LENGTH', `Vector buffer length (${buffer.length}) must be a multiple of 4 bytes.`);
        }
        const copy = new Uint8Array(buffer.length);
        copy.set(buffer);
        return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
    }
    /**
     * Encrypt a facial embedding vector using AES-256-GCM with Additional Authenticated Data (AAD).
     * AAD binds the Customer ID and Model Version ID directly into the cryptographic auth tag,
     * preventing template transplantation attacks across different customers or models.
     */
    encryptTemplate(vector, context) {
        if (!context.customerId || !context.modelVersionId) {
            throw new BiometricSecurityError('MISSING_AAD_CONTEXT', 'Customer ID and Model Version ID are mandatory Additional Authenticated Data (AAD) components.');
        }
        if (vector.length !== BiometricEncryptionEngine.EXPECTED_EMBEDDING_DIM) {
            throw new BiometricSecurityError('INVALID_EMBEDDING_DIMENSION', `Embedding vector length must be ${BiometricEncryptionEngine.EXPECTED_EMBEDDING_DIM}, received ${vector.length}`);
        }
        const plaintext = this.serializeVector(vector);
        const iv = crypto.randomBytes(BiometricEncryptionEngine.IV_LENGTH_BYTES);
        const aadString = `DFARM:CUST=${context.customerId}:MODEL=${context.modelVersionId}`;
        const aadBuffer = Buffer.from(aadString, 'utf8');
        const cipher = crypto.createCipheriv(BiometricEncryptionEngine.ALGORITHM, this.masterKey, iv, {
            authTagLength: BiometricEncryptionEngine.AUTH_TAG_LENGTH_BYTES,
        });
        cipher.setAAD(aadBuffer);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Zeroize plaintext buffer
        plaintext.fill(0);
        return {
            ciphertextBase64: ciphertext.toString('base64'),
            ivBase64: iv.toString('base64'),
            authTagBase64: authTag.toString('base64'),
            keyReference: this.keyReference,
            algorithm: 'AES-256-GCM',
        };
    }
    /**
     * Decrypt an encrypted biometric template and verify authentication tag and AAD bindings.
     * Throws AUTHENTICATION_TAG_VERIFICATION_FAILED if ciphertext, tag, IV, or AAD is tampered.
     */
    decryptTemplate(template, context) {
        if (!template.ciphertextBase64 || !template.ivBase64 || !template.authTagBase64) {
            throw new BiometricSecurityError('MALFORMED_TEMPLATE_PAYLOAD', 'Encrypted template must contain ciphertextBase64, ivBase64, and authTagBase64.');
        }
        const ciphertext = Buffer.from(template.ciphertextBase64, 'base64');
        const iv = Buffer.from(template.ivBase64, 'base64');
        const authTag = Buffer.from(template.authTagBase64, 'base64');
        if (iv.length !== BiometricEncryptionEngine.IV_LENGTH_BYTES) {
            throw new BiometricSecurityError('INVALID_IV_LENGTH', `IV length must be ${BiometricEncryptionEngine.IV_LENGTH_BYTES} bytes, received ${iv.length}.`);
        }
        if (authTag.length !== BiometricEncryptionEngine.AUTH_TAG_LENGTH_BYTES) {
            throw new BiometricSecurityError('INVALID_AUTH_TAG_LENGTH', `Auth tag length must be ${BiometricEncryptionEngine.AUTH_TAG_LENGTH_BYTES} bytes, received ${authTag.length}.`);
        }
        const aadString = `DFARM:CUST=${context.customerId}:MODEL=${context.modelVersionId}`;
        const aadBuffer = Buffer.from(aadString, 'utf8');
        const decipher = crypto.createDecipheriv(BiometricEncryptionEngine.ALGORITHM, this.masterKey, iv, {
            authTagLength: BiometricEncryptionEngine.AUTH_TAG_LENGTH_BYTES,
        });
        decipher.setAAD(aadBuffer);
        decipher.setAuthTag(authTag);
        try {
            const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            const vector = this.deserializeVector(plaintext);
            // Zeroize plaintext buffer
            plaintext.fill(0);
            return vector;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new BiometricSecurityError('AUTHENTICATION_TAG_VERIFICATION_FAILED', `Biometric template authentication failed: data corrupted or AAD mismatch (${message})`);
        }
    }
    /**
     * Secure zeroization of a float array in memory.
     */
    zeroizeVector(vector) {
        vector.fill(0);
    }
}
//# sourceMappingURL=encryption.js.map