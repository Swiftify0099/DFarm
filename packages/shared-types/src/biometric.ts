// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// SHARED TYPES: BIOMETRICS, FACE ENROLLMENT & RECOGNITION SPECIFICATION
// ==============================================================================

export enum FaceEnrollmentStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  REVOKED = 'REVOKED',
  PERMANENTLY_ERASED = 'PERMANENTLY_ERASED',
}

export enum BiometricConsentType {
  BIOMETRIC_FACE_ENROLLMENT = 'BIOMETRIC_FACE_ENROLLMENT',
}

export enum BiometricRetentionStatus {
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  ERASED = 'ERASED',
  EXEMPT = 'EXEMPT',
}

export enum LivenessClassification {
  LIVE = 'LIVE',
  SUSPECTED_SPOOF = 'SUSPECTED_SPOOF',
  RESTRICTED_PASS = 'RESTRICTED_PASS',
  FAILED = 'FAILED',
}

export enum LivenessChallengeType {
  LOOK_CENTER = 'LOOK_CENTER',
  TURN_RIGHT = 'TURN_RIGHT',
  TURN_LEFT = 'TURN_LEFT',
  BLINK = 'BLINK',
  SMILE = 'SMILE',
}

export enum FaceMatchDecisionStatus {
  MATCH_FOUND = 'MATCH_FOUND',
  UNKNOWN_CUSTOMER = 'UNKNOWN_CUSTOMER',
  AMBIGUOUS_COMPETING_MATCH = 'AMBIGUOUS_COMPETING_MATCH',
  INCOMPATIBLE_VERSION = 'INCOMPATIBLE_VERSION',
  INACTIVE_CUSTOMER = 'INACTIVE_CUSTOMER',
  REVOKED_CONSENT = 'REVOKED_CONSENT',
  DELETED_CUSTOMER = 'DELETED_CUSTOMER',
  LOW_QUALITY_INPUT = 'LOW_QUALITY_INPUT',
}

export interface FaceQualityMetrics {
  sharpness: number;            // Laplacian variance score (e.g. >= 100.0)
  isBlurred: boolean;
  meanLuminance: number;        // Average pixel value [0, 255]
  luminanceVariance: number;    // Lighting distribution variance
  isLightingAcceptable: boolean;
  yawDegrees: number;           // Rotation around vertical axis (-15 deg to +15 deg)
  pitchDegrees: number;         // Rotation around horizontal axis (-15 deg to +15 deg)
  rollDegrees: number;          // Rotation around line of sight (-15 deg to +15 deg)
  isPoseAcceptable: boolean;
  interPupillaryDistancePx: number; // Eye distance in pixels (>= 80px)
  isIpdAcceptable: boolean;
  detectedFaceCount: number;    // Exactly 1 allowed
  overallQualityScore: number;  // Normalized composite score [0.0, 1.0]
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
  ivBase64: string;             // 12-byte GCM IV
  authTagBase64: string;        // 16-byte GCM Authentication Tag
  keyReference: string;         // e.g. 'kms-dfarm-v1-2026'
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
  queryEmbedding: number[];     // Normalized 512D or model-specific vector
  qualityScore?: number;
  ambiguityMargin?: number;     // Minimum difference between top-1 and top-2
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
