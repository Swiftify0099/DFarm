import { FaceModelMetadata } from '@dfarm/shared-types';
export interface ExtendedFaceModelMetadata extends FaceModelMetadata {
    artifactStatus: 'VERIFIED' | 'UNVERIFIED_EMPTY_DIGEST' | 'MISSING';
    isApprovedForProduction: boolean;
    failSafeBehavior: 'REJECT_OR_FALLBACK_TO_RFID';
}
export declare class FaceModelService {
    static readonly EMPTY_FILE_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    static readonly CANONICAL_MODEL: ExtendedFaceModelMetadata;
    private readonly models;
    constructor();
    getActiveModel(): ExtendedFaceModelMetadata;
    static getActiveThreshold(): number;
    static isCalibrationApprovedForProduction(): boolean;
    /**
     * Strictly verify model artifact buffer against registered checksum.
     * Rejects empty file digests and mismatched hashes.
     */
    static verifyModelArtifact(binaryBuffer?: Buffer | null): {
        isVerified: boolean;
        checksum: string;
        reason?: string;
    };
    getModelById(id: string): ExtendedFaceModelMetadata | undefined;
    listModels(): ExtendedFaceModelMetadata[];
    registerModel(metadata: ExtendedFaceModelMetadata): void;
    activateModel(id: string): void;
}
//# sourceMappingURL=model-service.d.ts.map