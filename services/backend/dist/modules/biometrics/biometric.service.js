// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRICS BUSINESS SERVICE (ENROLLMENT, REVOCATION, QUALITY & STATUS)
// ==============================================================================
import { BiometricRepository } from './biometric.repository.js';
import { CustomerRepository } from '../customers/customer.repository.js';
import { BadRequestError, NotFoundError, ForbiddenError, } from '../../shared/errors/app-error.js';
import { FaceQualityEngine } from '../../biometric/quality.js';
export class BiometricService {
    /**
     * Enroll customer face biometric template.
     */
    static async enrollCustomerFace(customerId, payload, authContext) {
        // 1. Verify Customer Existence
        const customer = await CustomerRepository.getCustomerById(customerId, authContext.userSupabaseClient);
        if (!customer) {
            throw new NotFoundError(`Customer with ID ${customerId} not found`, 'CUSTOMER_NOT_FOUND');
        }
        if (customer.isDeleted) {
            throw new BadRequestError('Cannot enroll biometric face template for a soft-deleted customer. Customer must be restored first.', 'CUSTOMER_SOFT_DELETED');
        }
        const validEnrollmentStatuses = ['DRAFT', 'PENDING_FACE_ENROLLMENT', 'ACTIVE'];
        if (!validEnrollmentStatuses.includes(customer.status)) {
            throw new BadRequestError(`Cannot enroll biometric face template for customer with status '${customer.status}'. Customer must be DRAFT, PENDING_FACE_ENROLLMENT, or ACTIVE.`, 'CUSTOMER_INVALID_STATUS_FOR_ENROLLMENT');
        }
        if (authContext.organizationId && customer.organizationId !== authContext.organizationId) {
            throw new ForbiddenError('Cannot enroll biometric template for customer belonging to another organization.', 'ORGANIZATION_MISMATCH');
        }
        // 2. Explicit Biometric Consent Verification
        const activeConsent = await BiometricRepository.getActiveConsent(customerId, authContext.userSupabaseClient);
        if (!activeConsent) {
            if (payload.officerConsentConfirmation) {
                // Record consent synchronously with Registration Officer's attestation
                await BiometricRepository.recordConsent(customerId, authContext.userId, 'v1.0.0', 'mr', authContext.userSupabaseClient);
            }
            else {
                throw new ForbiddenError('Customer has not granted active biometric consent, or consent has been revoked. Enrollment prohibited by law.', 'BIOMETRIC_CONSENT_MISSING');
            }
        }
        // 3. Model Version Validation
        const model = await BiometricRepository.getModelVersionById(payload.modelVersionId, authContext.userSupabaseClient);
        if (!model) {
            throw new NotFoundError(`Face model version ${payload.modelVersionId} does not exist in registry.`, 'MODEL_VERSION_NOT_FOUND');
        }
        if (!model.isActive) {
            throw new BadRequestError(`Face model version ${model.modelName} ${model.modelVersion} is inactive. Templates cannot be enrolled with deprecated models.`, 'MODEL_VERSION_INACTIVE');
        }
        // 4. Quality Score Validation
        if (payload.qualityScore < FaceQualityEngine.MIN_OVERALL_QUALITY_THRESHOLD) {
            throw new BadRequestError(`Quality score (${payload.qualityScore.toFixed(3)}) is below minimum enrollment threshold (${FaceQualityEngine.MIN_OVERALL_QUALITY_THRESHOLD}). Capture quality must be improved.`, 'QUALITY_SCORE_TOO_LOW');
        }
        // 5. Encrypted Template Binary Envelope Validation
        const template = payload.encryptedTemplate;
        const iv = Buffer.from(template.ivBase64, 'base64');
        const authTag = Buffer.from(template.authTagBase64, 'base64');
        const ciphertext = Buffer.from(template.ciphertextBase64, 'base64');
        if (iv.length !== 12) {
            throw new BadRequestError(`Invalid IV length: expected 12 bytes for AES-256-GCM, received ${iv.length} bytes.`, 'INVALID_IV_LENGTH');
        }
        if (authTag.length !== 16) {
            throw new BadRequestError(`Invalid Auth Tag length: expected 16 bytes for AES-256-GCM, received ${authTag.length} bytes.`, 'INVALID_AUTH_TAG_LENGTH');
        }
        const expectedBytes = model.embeddingDimension * 4;
        if (ciphertext.length !== expectedBytes) {
            throw new BadRequestError(`Invalid ciphertext size: expected ${expectedBytes} bytes for ${model.embeddingDimension}D embedding, received ${ciphertext.length} bytes.`, 'INVALID_CIPHERTEXT_SIZE');
        }
        // 6. Persist to Database atomically
        const saved = await BiometricRepository.saveFaceEnrollment({
            customerId,
            modelVersionId: payload.modelVersionId,
            embeddingEncrypted: ciphertext,
            embeddingIv: iv,
            embeddingAuthTag: authTag,
            encryptionKeyReference: template.keyReference,
            qualityScore: payload.qualityScore,
            livenessScore: payload.livenessScore ?? null,
            enrolledBy: authContext.userId,
            deviceId: payload.deviceId,
        }, authContext.userSupabaseClient);
        return {
            enrollmentId: saved.enrollmentId,
            customerId: saved.customerId,
            modelVersionId: saved.modelVersionId,
            qualityScore: saved.qualityScore,
            livenessScore: saved.livenessScore !== undefined ? saved.livenessScore : null,
            livenessClassification: payload.livenessClassification,
            status: saved.status,
            enrolledAt: saved.enrolledAt,
        };
    }
    /**
     * Get customer face status metadata.
     * STRICT PRIVACY INVARIANT: NEVER returns encrypted biometric template or vectors!
     */
    static async getCustomerFaceStatus(customerId, authContext) {
        const customer = await CustomerRepository.getCustomerById(customerId, authContext.userSupabaseClient);
        if (!customer) {
            throw new NotFoundError(`Customer with ID ${customerId} not found`, 'CUSTOMER_NOT_FOUND');
        }
        const consent = await BiometricRepository.getActiveConsent(customerId, authContext.userSupabaseClient);
        const enrollment = await BiometricRepository.getActiveFaceEnrollmentStatus(customerId, authContext.userSupabaseClient);
        if (!enrollment) {
            return {
                customerId,
                hasEnrolledFace: false,
                consentActive: consent !== null,
            };
        }
        return {
            customerId,
            hasEnrolledFace: true,
            enrollmentId: enrollment.id,
            modelName: enrollment.face_model_versions?.model_name || 'MobileFaceNet-ArcFace',
            modelVersion: enrollment.face_model_versions?.model_version || 'v1.0.0',
            qualityScore: Number(enrollment.quality_score),
            livenessScore: enrollment.liveness_score ? Number(enrollment.liveness_score) : null,
            status: enrollment.status,
            enrolledAt: enrollment.enrolled_at,
            retentionPolicy: 'POLICY_SUBJECT_TO_CONSENT',
            consentActive: consent !== null,
        };
    }
    /**
     * Revoke face enrollment for customer.
     */
    static async revokeCustomerFace(customerId, payload, authContext) {
        const customer = await CustomerRepository.getCustomerById(customerId, authContext.userSupabaseClient);
        if (!customer) {
            throw new NotFoundError(`Customer with ID ${customerId} not found`, 'CUSTOMER_NOT_FOUND');
        }
        return BiometricRepository.revokeFaceEnrollment({
            customerId,
            erasedBy: authContext.userId,
            reason: payload.reason,
            permanentErasure: payload.permanentErasure ?? false,
        }, authContext.userSupabaseClient);
    }
    /**
     * List all registered face model versions.
     */
    static async listModels(authContext) {
        return BiometricRepository.listModelVersions(authContext?.userSupabaseClient);
    }
}
//# sourceMappingURL=biometric.service.js.map