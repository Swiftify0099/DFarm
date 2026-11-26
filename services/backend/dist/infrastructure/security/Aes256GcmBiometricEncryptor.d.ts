import { IBiometricEncryptor } from '../../application/ports/index.js';
export declare class Aes256GcmBiometricEncryptor implements IBiometricEncryptor {
    private static readonly ALGORITHM;
    private static readonly IV_LENGTH_BYTES;
    private static readonly AUTH_TAG_LENGTH_BYTES;
    static readonly EXPECTED_EMBEDDING_DIM = 128;
    private readonly masterKey;
    private readonly previousKeys;
    readonly keyReference: string;
    constructor(keyHex?: string, keyReference?: string, previousKeysHex?: string[]);
    serializeVector(vector: number[] | Float32Array): Buffer;
    deserializeVector(buffer: Buffer): number[];
    encrypt128DimEmbedding(embedding: number[], customerId: string, modelVersionId: string): {
        encryptedData: string;
        iv: string;
        authTag: string;
        keyReference: string;
    };
    decrypt128DimEmbedding(encryptedData: string, iv: string, authTag: string, customerId: string, modelVersionId: string): number[];
}
//# sourceMappingURL=Aes256GcmBiometricEncryptor.d.ts.map