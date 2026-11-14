import { FaceEnrollmentRequestPayload, FaceStatusResponse, FaceRevocationRequestPayload, FaceEnrollmentStatus, LivenessClassification } from '@dfarm/shared-types';
import { AuthContext } from '../../middleware/authenticate.js';
export declare class BiometricService {
    /**
     * Enroll customer face biometric template.
     */
    static enrollCustomerFace(customerId: string, payload: FaceEnrollmentRequestPayload, authContext: AuthContext): Promise<{
        enrollmentId: string;
        customerId: string;
        modelVersionId: string;
        qualityScore: number;
        livenessScore: number | null;
        livenessClassification: LivenessClassification;
        status: FaceEnrollmentStatus;
        enrolledAt: string;
    }>;
    /**
     * Get customer face status metadata.
     * STRICT PRIVACY INVARIANT: NEVER returns encrypted biometric template or vectors!
     */
    static getCustomerFaceStatus(customerId: string, authContext: AuthContext): Promise<FaceStatusResponse>;
    /**
     * Revoke face enrollment for customer.
     */
    static revokeCustomerFace(customerId: string, payload: FaceRevocationRequestPayload, authContext: AuthContext): Promise<{
        customerId: string;
        status: any;
        revokedAt: any;
        permanentErasure: boolean;
    }>;
    /**
     * List all registered face model versions.
     */
    static listModels(authContext?: AuthContext): Promise<{
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
}
//# sourceMappingURL=biometric.service.d.ts.map