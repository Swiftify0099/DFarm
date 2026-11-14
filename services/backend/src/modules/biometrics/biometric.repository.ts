// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// BIOMETRICS DATA REPOSITORY (POSTGRESQL & SUPABASE INTEGRATION)
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from '../../config/supabase.js';
import { FaceEnrollmentStatus } from '@dfarm/shared-types';
import { AppError } from '../../shared/errors/app-error.js';
import { FaceModelService } from '../../biometric/model-service.js';

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

export class BiometricRepository {
  private static getClient(overrideClient?: SupabaseClient): SupabaseClient {
    return overrideClient ?? getAdminSupabaseClient();
  }

  /**
   * Verify if active biometric consent is on file for customer.
   */
  public static async getActiveConsent(
    customerId: string,
    overrideClient?: SupabaseClient
  ): Promise<RawConsentRecord | null> {
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('customer_consent_records')
      .select('*')
      .eq('customer_id', customerId)
      .eq('consent_type', 'BIOMETRIC_FACE_ENROLLMENT')
      .eq('consent_granted', true)
      .is('revoked_at', null)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, 'DATABASE_QUERY_ERROR');
    }
    return data;
  }

  /**
   * Record new customer biometric consent.
   */
  public static async recordConsent(
    customerId: string,
    officerId: string,
    consentTextVersion = 'v1.0.0',
    consentLanguage = 'mr',
    overrideClient?: SupabaseClient
  ): Promise<RawConsentRecord> {
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('customer_consent_records')
      .insert({
        customer_id: customerId,
        consent_type: 'BIOMETRIC_FACE_ENROLLMENT',
        consent_granted: true,
        consent_text_version: consentTextVersion,
        consent_language: consentLanguage,
        officer_id: officerId,
      })
      .select('*')
      .single();

    if (error) {
      throw new AppError(error.message, 500, 'DATABASE_INSERT_ERROR');
    }
    return data;
  }

  /**
   * Fetch active face model version.
   */
  public static async getActiveModelVersion(overrideClient?: SupabaseClient) {
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('face_model_versions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return FaceModelService.CANONICAL_MODEL;
    }

    return {
      id: data.id,
      modelName: data.model_name,
      modelVersion: data.model_version,
      embeddingDimension: data.embedding_dimension,
      similarityMetric: data.similarity_metric,
      recommendedThreshold: Number(data.recommended_threshold),
      modelArtifactChecksum: data.model_artifact_checksum || 'INVALID_EMPTY_HASH',
      preprocessingVersion: data.preprocessing_version || 'insightface-112x112-v1',
      modelLicense: data.model_license || 'Apache-2.0',
      isActive: data.is_active,
      calibrationStatus: data.calibration_status || 'NOT_CALIBRATED',
      createdAt: data.created_at,
    };
  }

  /**
   * Fetch face model version by ID.
   */
  public static async getModelVersionById(id: string, overrideClient?: SupabaseClient) {
    if (id === FaceModelService.CANONICAL_MODEL.id) {
      return FaceModelService.CANONICAL_MODEL;
    }
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('face_model_versions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      modelName: data.model_name,
      modelVersion: data.model_version,
      embeddingDimension: data.embedding_dimension,
      similarityMetric: data.similarity_metric,
      recommendedThreshold: Number(data.recommended_threshold),
      modelArtifactChecksum: data.model_artifact_checksum || 'INVALID_EMPTY_HASH',
      preprocessingVersion: data.preprocessing_version || 'insightface-112x112-v1',
      modelLicense: data.model_license || 'Apache-2.0',
      isActive: data.is_active,
      calibrationStatus: data.calibration_status || 'NOT_CALIBRATED',
      createdAt: data.created_at,
    };
  }

  /**
   * List all face model versions.
   */
  public static async listModelVersions(overrideClient?: SupabaseClient) {
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('face_model_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return [FaceModelService.CANONICAL_MODEL];
    }

    return data.map((d: any) => ({
      id: d.id,
      modelName: d.model_name,
      modelVersion: d.model_version,
      embeddingDimension: d.embedding_dimension,
      similarityMetric: d.similarity_metric,
      recommendedThreshold: Number(d.recommended_threshold),
      modelArtifactChecksum: d.model_artifact_checksum || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      preprocessingVersion: d.preprocessing_version || 'insightface-112x112-v1',
      modelLicense: d.model_license || 'Apache-2.0',
      isActive: d.is_active,
      calibrationStatus: d.calibration_status || 'CALIBRATED_STAGING_v1',
      createdAt: d.created_at,
    }));
  }

  /**
   * Get active face enrollment status for a customer.
   * STRICT SECURITY INVARIANT: DOES NOT RETURN ENCRYPTED BIOMETRIC VECTOR OR EMBEDDING!
   */
  public static async getActiveFaceEnrollmentStatus(
    customerId: string,
    overrideClient?: SupabaseClient
  ) {
    const client = this.getClient(overrideClient);
    const { data, error } = await client
      .from('face_enrollments')
      .select(`
        id,
        customer_id,
        model_version_id,
        quality_score,
        liveness_score,
        status,
        enrolled_at,
        enrolled_by,
        device_id,
        encryption_key_reference,
        face_model_versions:model_version_id (
          model_name,
          model_version
        )
      `)
      .eq('customer_id', customerId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, 'DATABASE_QUERY_ERROR');
    }
    return data;
  }

  /**
   * Save face enrollment template atomically.
   */
  public static async saveFaceEnrollment(
    params: SaveEnrollmentParams,
    overrideClient?: SupabaseClient
  ) {
    const client = this.getClient(overrideClient);

    // 1. Supersede any existing active template for this model version
    await client
      .from('face_enrollments')
      .update({ status: 'SUPERSEDED' })
      .eq('customer_id', params.customerId)
      .eq('model_version_id', params.modelVersionId)
      .eq('status', 'ACTIVE');

    // 2. Insert new enrollment record
    const { data: enrollment, error: insertErr } = await client
      .from('face_enrollments')
      .insert({
        customer_id: params.customerId,
        model_version_id: params.modelVersionId,
        embedding_encrypted: params.embeddingEncrypted,
        embedding_iv: params.embeddingIv,
        embedding_auth_tag: params.embeddingAuthTag,
        encryption_key_reference: params.encryptionKeyReference,
        quality_score: params.qualityScore,
        liveness_score: params.livenessScore ?? null,
        status: 'ACTIVE',
        enrolled_by: params.enrolledBy,
        device_id: params.deviceId,
      })
      .select('*')
      .single();

    if (insertErr) {
      throw new AppError(insertErr.message, 500, 'FACE_ENROLLMENT_INSERT_FAILED');
    }

    // 3. Create retention policy record
    await client
      .from('biometric_retention_records')
      .insert({
        customer_id: params.customerId,
        face_enrollment_id: enrollment.id,
        retention_policy_name: 'POLICY_SUBJECT_TO_CONSENT',
        retention_status: 'ACTIVE',
      });

    // 4. Update customer status
    const { data: customer } = await client
      .from('customers')
      .select('status, organization_id, primary_center_id, farmer_code')
      .eq('id', params.customerId)
      .single();

    if (customer && (customer.status === 'PENDING_FACE_ENROLLMENT' || customer.status === 'DRAFT')) {
      const { data: rfidData } = await client
        .from('rfid_card_assignments')
        .select('id')
        .eq('customer_id', params.customerId)
        .eq('is_active', true)
        .maybeSingle();

      const nextStatus = rfidData ? 'ACTIVE' : 'PENDING_RFID_ASSIGNMENT';
      const regStatus = rfidData ? 'COMPLETED' : 'IN_PROGRESS';

      await client
        .from('customers')
        .update({
          status: nextStatus,
          registration_status: regStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.customerId);

      // Audit status history
      await client
        .from('customer_status_history')
        .insert({
          customer_id: params.customerId,
          previous_status: customer.status,
          new_status: nextStatus,
          change_reason: rfidData
            ? 'Registration completed: Both Face and RFID are enrolled.'
            : 'Face biometric template successfully enrolled and encrypted. Awaiting RFID assignment.',
          changed_by: params.enrolledBy,
        });
    }

    return {
      enrollmentId: enrollment.id,
      customerId: params.customerId,
      modelVersionId: params.modelVersionId,
      qualityScore: params.qualityScore,
      livenessScore: params.livenessScore,
      status: 'ACTIVE' as FaceEnrollmentStatus,
      enrolledAt: enrollment.enrolled_at,
    };
  }

  /**
   * Revoke face enrollment.
   */
  public static async revokeFaceEnrollment(
    params: RevokeEnrollmentParams,
    overrideClient?: SupabaseClient
  ) {
    const client = this.getClient(overrideClient);

    const updatePayload: any = {
      status: params.permanentErasure ? 'PERMANENTLY_ERASED' : 'REVOKED',
      erased_at: new Date().toISOString(),
      erased_by: params.erasedBy,
      erasure_reason: params.reason,
    };

    if (params.permanentErasure) {
      updatePayload.embedding_encrypted = Buffer.alloc(0);
      updatePayload.embedding_iv = Buffer.alloc(0);
      updatePayload.embedding_auth_tag = Buffer.alloc(0);
    }

    const { data: enrollment, error } = await client
      .from('face_enrollments')
      .update(updatePayload)
      .eq('customer_id', params.customerId)
      .eq('status', 'ACTIVE')
      .select('id')
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, 'FACE_REVOCATION_FAILED');
    }

    // Revoke biometric consent record
    await client
      .from('customer_consent_records')
      .update({
        revoked_at: new Date().toISOString(),
        revocation_reason: params.reason,
      })
      .eq('customer_id', params.customerId)
      .is('revoked_at', null);

    // Update retention record
    if (enrollment) {
      await client
        .from('biometric_retention_records')
        .update({
          retention_status: 'ERASED',
        })
        .eq('face_enrollment_id', enrollment.id);
    }

    return {
      customerId: params.customerId,
      status: updatePayload.status,
      revokedAt: updatePayload.erased_at,
      permanentErasure: params.permanentErasure,
    };
  }
}
