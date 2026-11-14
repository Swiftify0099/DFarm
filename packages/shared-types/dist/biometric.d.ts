export declare enum FaceEnrollmentStatus {
    ACTIVE = "ACTIVE",
    SUPERSEDED = "SUPERSEDED",
    REVOKED = "REVOKED",
    PERMANENTLY_ERASED = "PERMANENTLY_ERASED"
}
export declare enum BiometricConsentType {
    BIOMETRIC_FACE_ENROLLMENT = "BIOMETRIC_FACE_ENROLLMENT"
}
export declare enum BiometricRetentionStatus {
    ACTIVE = "ACTIVE",
    GRACE_PERIOD = "GRACE_PERIOD",
    ERASED = "ERASED",
    EXEMPT = "EXEMPT"
}
export declare enum LivenessClassification {
    LIVE = "LIVE",
    SUSPECTED_SPOOF = "SUSPECTED_SPOOF",
    RESTRICTED_PASS = "RESTRICTED_PASS",
    FAILED = "FAILED"
}
export declare enum LivenessChallengeType {
    LOOK_CENTER = "LOOK_CENTER",
    TURN_RIGHT = "TURN_RIGHT",
    TURN_LEFT = "TURN_LEFT",
    BLINK = "BLINK",
    SMILE = "SMILE"
}
export declare enum FaceMatchDecisionStatus {
    MATCH_FOUND = "MATCH_FOUND",
    UNKNOWN_CUSTOMER = "UNKNOWN_CUSTOMER",
    AMBIGUOUS_COMPETING_MATCH = "AMBIGUOUS_COMPETING_MATCH",
    INCOMPATIBLE_VERSION = "INCOMPATIBLE_VERSION",
    INACTIVE_CUSTOMER = "INACTIVE_CUSTOMER",
    REVOKED_CONSENT = "REVOKED_CONSENT",
    DELETED_CUSTOMER = "DELETED_CUSTOMER",
    LOW_QUALITY_INPUT = "LOW_QUALITY_INPUT"
}
export interface FaceQualityMetrics {
    sharpness: number;
    isBlurred: boolean;
    meanLuminance: number;
    luminanceVariance: number;
    isLightingAcceptable: boolean;
    yawDegrees: number;
    pitchDegrees: number;
    rollDegrees: number;
    isPoseAcceptable: boolean;
    interPupillaryDistancePx: number;
    isIpdAcceptable: boolean;
    detectedFaceCount: number;
    overallQualityScore: number;
    isAcceptableForEnrollment: boolean;
    rejectionReasons: string[];
}
export interface FaceModelMetadata {
    id: string;
    modelName: string;
    modelVersion: string;
    embeddingDimension: number;
    similarityMetric: 'COSINE' | 'EUCLIDEAN';
    recommendedThreshold: number;
    modelArtifactChecksum: string;
    preprocessingVersion: string;
    modelLicense: string;
    isActive: boolean;
    calibrationStatus: string;
    createdAt: string;
}
export interface EncryptedBiometricTemplate {
    ciphertextBase64: string;
    ivBase64: string;
    authTagBase64: string;
    keyReference: string;
    algorithm: 'AES-256-GCM';
}
export interface FaceEnrollmentRequestPayload {
    customerId: string;
    modelVersionId: string;
    encryptedTemplate: EncryptedBiometricTemplate;
    qualityScore: number;
    livenessScore?: number;
    livenessClassification: LivenessClassification;
    deviceId: string;
    samplesCount: number;
    officerConsentConfirmation: boolean;
}
export interface FaceEnrollmentRecord {
    id: string;
    customerId: string;
    modelVersionId: string;
    qualityScore: number;
    livenessScore: number | null;
    status: FaceEnrollmentStatus;
    enrolledAt: string;
    enrolledBy: string;
    deviceId: string;
    encryptionKeyReference: string;
}
export interface FaceMatchQueryPayload {
    centerId: string;
    modelVersionId: string;
    queryEmbedding: number[];
    qualityScore?: number;
    ambiguityMargin?: number;
}
export interface FaceCandidateMatch {
    customerId: string;
    farmerCode: string;
    fullName: string;
    similarityScore: number;
}
export interface FaceMatchEvaluationResult {
    status: FaceMatchDecisionStatus;
    matchedCustomer: FaceCandidateMatch | null;
    competingCandidates: FaceCandidateMatch[];
    similarityScore: number;
    calibratedThreshold: number;
    modelVersion: string;
    calibrationVersion: string;
    message: string;
}
export interface FaceStatusResponse {
    customerId: string;
    hasEnrolledFace: boolean;
    enrollmentId?: string;
    modelName?: string;
    modelVersion?: string;
    qualityScore?: number;
    livenessScore?: number | null;
    status?: FaceEnrollmentStatus;
    enrolledAt?: string;
    retentionPolicy?: string;
    consentActive: boolean;
}
export interface FaceRevocationRequestPayload {
    reason: string;
    permanentErasure?: boolean;
}
//# sourceMappingURL=biometric.d.ts.map