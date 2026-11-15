/**
 * DFarm Registration App - Face Biometrics API Client
 * Parity with FaceApiClient.kt
 */

import { apiClient } from './apiClient';
import {
  EncryptedEnvelope,
  FaceEnrollmentResponse,
  FaceStatusResult,
} from '../types/models';

export const faceApi = {
  async submitEnrollment(params: {
    customerId: string;
    modelVersionId: string;
    encryptedEnvelope: EncryptedEnvelope;
    qualityScore: number;
    livenessScore?: number | null;
    livenessClassification: string;
    deviceId: string;
  }): Promise<FaceEnrollmentResponse> {
    const payload = {
      modelVersionId: params.modelVersionId,
      encryptedTemplate: {
        ciphertextBase64: params.encryptedEnvelope.ciphertextBase64,
        ivBase64: params.encryptedEnvelope.ivBase64,
        authTagBase64: params.encryptedEnvelope.authTagBase64,
        keyReference: params.encryptedEnvelope.keyReference,
        algorithm: params.encryptedEnvelope.algorithm,
      },
      qualityScore: params.qualityScore,
      ...(params.livenessScore != null ? { livenessScore: params.livenessScore } : {}),
      livenessClassification: params.livenessClassification,
      deviceId: params.deviceId,
      samplesCount: 3,
      officerConsentConfirmation: true,
    };

    try {
      const res = await apiClient.post<any>(
        `api/v1/customers/${params.customerId}/face-enroll`,
        payload
      );

      const data = res.data;
      if (res.success && data) {
        return {
          success: true,
          enrollmentId: data.enrollmentId,
          customerId: data.customerId || params.customerId,
          modelVersionId: data.modelVersionId || params.modelVersionId,
          qualityScore: data.qualityScore ?? params.qualityScore,
          status: data.status || 'ACTIVE',
          enrolledAt: data.enrolledAt || new Date().toISOString(),
        };
      }
      return {
        success: false,
        customerId: params.customerId,
        errorMessage: res.message || 'Enrollment rejected by backend server',
      };
    } catch (err: any) {
      return {
        success: false,
        customerId: params.customerId,
        errorMessage: err.message || 'Network error connecting to backend API',
      };
    }
  },

  async getFaceStatus(customerId: string): Promise<FaceStatusResult> {
    try {
      const res = await apiClient.get<any>(
        `api/v1/customers/${customerId}/face-status`
      );

      const data = res.data;
      if (res.success && data) {
        return {
          success: true,
          customerId: data.customerId,
          hasEnrolledFace: !!data.hasEnrolledFace,
          enrollmentId: data.enrollmentId || null,
          modelVersion: data.modelVersion || null,
          qualityScore: data.qualityScore ?? null,
          status: data.status || null,
          enrolledAt: data.enrolledAt || null,
        };
      }

      return {
        success: false,
        customerId,
        hasEnrolledFace: false,
        errorMessage: res.message || 'Failed to retrieve face status',
      };
    } catch (err: any) {
      return {
        success: false,
        customerId,
        hasEnrolledFace: false,
        errorMessage: err.message || 'Network error querying face status',
      };
    }
  },

  async revokeFace(customerId: string, reason: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await apiClient.post<any>(
        `api/v1/customers/${customerId}/face-revoke`,
        { reason, officerNotes: reason }
      );
      return {
        success: res.success !== false,
        message: res.message || 'Face enrollment revoked successfully',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error revoking face enrollment',
      };
    }
  },
};
