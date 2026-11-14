import type { SupabaseClient } from '@supabase/supabase-js';
import { FaceEnrollmentStatus } from '@dfarm/shared-types';
export interface RawConsentRecord {
    id: string;
    customer_id: string;
    consent_type: string;
    consent_granted: boolean;
    consent_text_version: string;
    consent_language: string;
    officer_id: string;
    recorded_at: string;
    revoked_at: string | null;
    revocation_reason: string | null;
}
export interface SaveEnrollmentParams {
    customerId: string;
    modelVersionId: string;
    embeddingEncrypted: Buffer;
    embeddingIv: Buffer;
    embeddingAuthTag: Buffer;
    encryptionKeyReference: string;
    qualityScore: number;
    livenessScore?: number | null;
    enrolledBy: string;
    deviceId: string;
}
export interface RevokeEnrollmentParams {
    customerId: string;
    erasedBy: string;
    reason: string;
    permanentErasure: boolean;
}
export declare class BiometricRepository {
    private static getClient;
    /**
     * Verify if active biometric consent is on file for customer.
     */
    static getActiveConsent(customerId: string, overrideClient?: SupabaseClient): Promise<RawConsentRecord | null>;
    /**
     * Record new customer biometric consent.
     */
    static recordConsent(customerId: string, officerId: string, consentTextVersion?: string, consentLanguage?: string, overrideClient?: SupabaseClient): Promise<RawConsentRecord>;
    /**
     * Fetch active face model version.
     */
    static getActiveModelVersion(overrideClient?: SupabaseClient): Promise<import("../../biometric/model-service.js").ExtendedFaceModelMetadata | {
        id: any;
        modelName: any;
        modelVersion: any;
        embeddingDimension: any;
        similarityMetric: any;
        recommendedThreshold: number;
        modelArtifactChecksum: any;
        preprocessingVersion: any;
        modelLicense: any;
        isActive: any;
        calibrationStatus: any;
        createdAt: any;
    }>;
    /**
     * Fetch face model version by ID.
     */
    static getModelVersionById(id: string, overrideClient?: SupabaseClient): Promise<import("../../biometric/model-service.js").ExtendedFaceModelMetadata | {
        id: any;
        modelName: any;
        modelVersion: any;
        embeddingDimension: any;
        similarityMetric: any;
        recommendedThreshold: number;
        modelArtifactChecksum: any;
        preprocessingVersion: any;
        modelLicense: any;
        isActive: any;
        calibrationStatus: any;
        createdAt: any;
    } | null>;
    /**
     * List all face model versions.
     */
    static listModelVersions(overrideClient?: SupabaseClient): Promise<{
        id: any;
        modelName: any;
        modelVersion: any;
        embeddingDimension: any;
        similarityMetric: any;
        recommendedThreshold: number;
        modelArtifactChecksum: any;
        preprocessingVersion: any;
        modelLicense: any;
        isActive: any;
        calibrationStatus: any;
        createdAt: any;
    }[]>;
    /**
     * Get active face enrollment status for a customer.
     * STRICT SECURITY INVARIANT: DOES NOT RETURN ENCRYPTED BIOMETRIC VECTOR OR EMBEDDING!
     */
    static getActiveFaceEnrollmentStatus(customerId: string, overrideClient?: SupabaseClient): Promise<{
        id: any;
        customer_id: any;
        model_version_id: any;
        quality_score: any;
        liveness_score: any;
        status: any;
        enrolled_at: any;
        enrolled_by: any;
        device_id: any;
        encryption_key_reference: any;
        face_model_versions: {
            model_name: any;
            model_version: any;
        }[];
    } | null>;
    /**
     * Save face enrollment template atomically.
     */
    static saveFaceEnrollment(params: SaveEnrollmentParams, overrideClient?: SupabaseClient): Promise<{
        enrollmentId: any;
        customerId: string;
        modelVersionId: string;
        qualityScore: number;
        livenessScore: number | null | undefined;
        status: FaceEnrollmentStatus;
        enrolledAt: any;
    }>;
    /**
     * Revoke face enrollment.
     */
    static revokeFaceEnrollment(params: RevokeEnrollmentParams, overrideClient?: SupabaseClient): Promise<{
        customerId: string;
        status: any;
        revokedAt: any;
        permanentErasure: boolean;
    }>;
}
//# sourceMappingURL=biometric.repository.d.ts.map