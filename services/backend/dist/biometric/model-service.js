// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// FACE MODEL VERSION REGISTRY & LIFECYCLE MANAGEMENT SERVICE (CENTRALIZED)
// ==============================================================================
import crypto from 'node:crypto';
export class FaceModelService {
    // Empty file SHA-256 digest
    static EMPTY_FILE_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    // Canonical central verified model: MobileFaceNet with ArcFace Loss
    // Staging threshold: 0.720. Calibration status: NOT_CALIBRATED.
    static CANONICAL_MODEL = {
        id: 'f0000000-0000-0000-0000-000000000001',
        modelName: 'MobileFaceNet-ArcFace',
        modelVersion: 'v1.0.0',
        embeddingDimension: 512,
        similarityMetric: 'COSINE',
        recommendedThreshold: 0.720,
        modelArtifactChecksum: 'INVALID_EMPTY_HASH',
        preprocessingVersion: 'insightface-112x112-v1',
        modelLicense: 'Apache-2.0',
        isActive: true,
        calibrationStatus: 'NOT_CALIBRATED',
        artifactStatus: 'UNVERIFIED_EMPTY_DIGEST',
        isApprovedForProduction: false, // Fail-safe: Not approved for production until genuine ONNX artifact & calibration are owner-signed
        failSafeBehavior: 'REJECT_OR_FALLBACK_TO_RFID',
        createdAt: '2026-11-13T00:00:00Z',
    };
    models = new Map();
    constructor() {
        this.models.set(FaceModelService.CANONICAL_MODEL.id, FaceModelService.CANONICAL_MODEL);
    }
    getActiveModel() {
        const active = Array.from(this.models.values()).find(m => m.isActive);
        if (!active) {
            return FaceModelService.CANONICAL_MODEL;
        }
        return active;
    }
    static getActiveThreshold() {
        return FaceModelService.CANONICAL_MODEL.recommendedThreshold;
    }
    static isCalibrationApprovedForProduction() {
        return FaceModelService.CANONICAL_MODEL.isApprovedForProduction;
    }
    /**
     * Strictly verify model artifact buffer against registered checksum.
     * Rejects empty file digests and mismatched hashes.
     */
    static verifyModelArtifact(binaryBuffer) {
        if (!binaryBuffer || binaryBuffer.length === 0) {
            return {
                isVerified: false,
                checksum: FaceModelService.EMPTY_FILE_SHA256,
                reason: 'MODEL_ARTIFACT_MISSING: Model binary file not provided or 0 bytes.',
            };
        }
        const hash = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
        if (hash === FaceModelService.EMPTY_FILE_SHA256) {
            return {
                isVerified: false,
                checksum: hash,
                reason: 'MODEL_ARTIFACT_EMPTY: Model checksum matches empty file digest (0 bytes). Inference unverified.',
            };
        }
        if (hash !== FaceModelService.CANONICAL_MODEL.modelArtifactChecksum) {
            return {
                isVerified: false,
                checksum: hash,
                reason: `MODEL_CHECKSUM_MISMATCH: Computed ${hash} != Expected ${FaceModelService.CANONICAL_MODEL.modelArtifactChecksum}`,
            };
        }
        return {
            isVerified: true,
            checksum: hash,
        };
    }
    getModelById(id) {
        return this.models.get(id);
    }
    listModels() {
        return Array.from(this.models.values());
    }
    registerModel(metadata) {
        this.models.set(metadata.id, metadata);
    }
    activateModel(id) {
        for (const [key, model] of this.models.entries()) {
            model.isActive = (key === id);
        }
    }
}
//# sourceMappingURL=model-service.js.map