import crypto from 'node:crypto';
import { BiometricVerificationError } from '../../domain/errors/index.js';
export class Aes256GcmBiometricEncryptor {
    static ALGORITHM = 'aes-256-gcm';
    static IV_LENGTH_BYTES = 12; // 96 bits standard for GCM
    static AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
    static EXPECTED_EMBEDDING_DIM = 128; // OpenCV SFace INT8
    masterKey;
    keyReference;
    constructor(keyHex, keyReference = 'key-sface128-v1') {
        const rawKeyHex = keyHex ||
            process.env['DATA_ENCRYPTION_KEY_HEX'] ||
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (!rawKeyHex || rawKeyHex.length !== 64) {
            throw new BiometricVerificationError('Data encryption key must be a 64-character hex string representing a 256-bit AES key.');
        }
        this.masterKey = Buffer.from(rawKeyHex, 'hex');
        this.keyReference = keyReference;
    }
    serializeVector(vector) {
        const floatArray = vector instanceof Float32Array ? vector : new Float32Array(vector);
        const view = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
        const copy = Buffer.alloc(view.length);
        view.copy(copy);
        return copy;
    }
    deserializeVector(buffer) {
        if (buffer.length % 4 !== 0) {
            throw new BiometricVerificationError(`Vector buffer length (${buffer.length}) must be a multiple of 4 bytes.`);
        }
        const copy = new Uint8Array(buffer.length);
        copy.set(buffer);
        const floatArray = new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
        return Array.from(floatArray);
    }
    encrypt128DimEmbedding(embedding, customerId, modelVersionId) {
        if (!customerId || !modelVersionId) {
            throw new BiometricVerificationError('Customer ID and Model Version ID are mandatory Additional Authenticated Data (AAD) components.');
        }
        if (embedding.length !== Aes256GcmBiometricEncryptor.EXPECTED_EMBEDDING_DIM) {
            throw new BiometricVerificationError(`Embedding vector length must be ${Aes256GcmBiometricEncryptor.EXPECTED_EMBEDDING_DIM} for OpenCV SFace INT8, received ${embedding.length}`);
        }
        const plaintext = this.serializeVector(embedding);
        const iv = crypto.randomBytes(Aes256GcmBiometricEncryptor.IV_LENGTH_BYTES);
        const aadString = `DFARM:CUST=${customerId}:MODEL=${modelVersionId}`;
        const aadBuffer = Buffer.from(aadString, 'utf8');
        const cipher = crypto.createCipheriv(Aes256GcmBiometricEncryptor.ALGORITHM, this.masterKey, iv, {
            authTagLength: Aes256GcmBiometricEncryptor.AUTH_TAG_LENGTH_BYTES,
        });
        cipher.setAAD(aadBuffer);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return {
            encryptedData: ciphertext.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            keyReference: this.keyReference,
        };
    }
    decrypt128DimEmbedding(encryptedData, iv, authTag, customerId, modelVersionId) {
        if (!customerId || !modelVersionId) {
            throw new BiometricVerificationError('Customer ID and Model Version ID are mandatory AAD components for decryption.');
        }
        const ivBuffer = Buffer.from(iv, 'base64');
        const authTagBuffer = Buffer.from(authTag, 'base64');
        const ciphertextBuffer = Buffer.from(encryptedData, 'base64');
        const aadBuffer = Buffer.from(`DFARM:CUST=${customerId}:MODEL=${modelVersionId}`, 'utf8');
        const decipher = crypto.createDecipheriv(Aes256GcmBiometricEncryptor.ALGORITHM, this.masterKey, ivBuffer, {
            authTagLength: Aes256GcmBiometricEncryptor.AUTH_TAG_LENGTH_BYTES,
        });
        decipher.setAAD(aadBuffer);
        decipher.setAuthTag(authTagBuffer);
        try {
            const plaintext = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
            const vector = this.deserializeVector(plaintext);
            if (vector.length !== Aes256GcmBiometricEncryptor.EXPECTED_EMBEDDING_DIM) {
                throw new BiometricVerificationError(`Decrypted embedding dimension mismatch: expected ${Aes256GcmBiometricEncryptor.EXPECTED_EMBEDDING_DIM}, found ${vector.length}`);
            }
            return vector;
        }
        catch (err) {
            if (err instanceof BiometricVerificationError)
                throw err;
            throw new BiometricVerificationError('Biometric decryption failed: corrupted template or AAD mismatch');
        }
    }
}
//# sourceMappingURL=Aes256GcmBiometricEncryptor.js.map