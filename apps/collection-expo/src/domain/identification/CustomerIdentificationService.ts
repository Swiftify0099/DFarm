import {
  Customer,
  IdentificationMethod,
} from '../../types';

export type IdentificationResult =
  | {
      type: 'SUCCESS';
      customer: Customer;
      canonicalUuid: string;
      method: IdentificationMethod;
      confidenceScore?: number | null;
      identifiedAt: number;
    }
  | {
      type: 'FAILURE';
      reason: string;
      errorCode: string;
    };

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null> | Customer | null;
  findByFarmerCode(code: string): Promise<Customer | null> | Customer | null;
  findByRfid(rfid: string): Promise<Customer | null> | Customer | null;
  search(query: string): Promise<Customer[]> | Customer[];
}

export interface FaceModelCalibrationConfig {
  modelVersion: string;
  preprocessingVersion: string;
  threshold: number;
  isCalibrationApproved: boolean;
  approvalStatus: string;
}

export const CANONICAL_FACE_THRESHOLD = 0.72;

export const DEFAULT_CALIBRATION_CONFIG: FaceModelCalibrationConfig = {
  modelVersion: 'MobileFaceNet-ArcFace-v1.0.0',
  preprocessingVersion: '112x112-norm-mean127.5-scale128.0',
  threshold: CANONICAL_FACE_THRESHOLD,
  isCalibrationApproved: true,
  approvalStatus: 'PRODUCTION_APPROVED_v1.0.0',
};

export class CustomerIdentificationService {
  constructor(
    private customerRepository: CustomerRepository,
    private expectedCenterId: string,
    private expectedOrganizationId: string,
    private maxOfflineHours: number | null = null,
    private lastSyncTimestamp: number = Date.now(),
    private calibrationConfig: FaceModelCalibrationConfig = DEFAULT_CALIBRATION_CONFIG
  ) {}

  async identifyByFace(
    embedding: Float32Array | number[],
    faceMatchCandidate: Customer | null,
    similarityScore: number,
    minimumConfidence: number = this.calibrationConfig.threshold
  ): Promise<IdentificationResult> {
    if (!this.calibrationConfig.isCalibrationApproved) {
      return {
        type: 'FAILURE',
        reason: `Face model calibration is unverified for production (${this.calibrationConfig.approvalStatus}). Fail-safe fallback to RFID or Manual identification required.`,
        errorCode: 'CALIBRATION_NOT_APPROVED',
      };
    }
    if (similarityScore < minimumConfidence || !faceMatchCandidate) {
      return {
        type: 'FAILURE',
        reason: `Face match confidence ${similarityScore} below required threshold ${minimumConfidence}`,
        errorCode: 'FACE_MATCH_UNCERTAIN',
      };
    }
    return this.validateAndResolve(
      faceMatchCandidate,
      'FACE',
      similarityScore
    );
  }

  async identifyByRfid(rfidTag: string): Promise<IdentificationResult> {
    if (!rfidTag || rfidTag.trim().length === 0) {
      return {
        type: 'FAILURE',
        reason: 'RFID tag cannot be empty',
        errorCode: 'INVALID_RFID',
      };
    }
    const customer = await this.customerRepository.findByRfid(rfidTag.trim());
    if (!customer) {
      return {
        type: 'FAILURE',
        reason: `No active customer assigned to RFID tag: ${rfidTag}`,
        errorCode: 'RFID_NOT_FOUND',
      };
    }
    return this.validateAndResolve(customer, 'RFID');
  }

  async identifyBySupervisorManual(
    farmerCodeOrId: string,
    supervisorUserId: string,
    justification: string
  ): Promise<IdentificationResult> {
    if (!supervisorUserId || supervisorUserId.trim().length === 0 || justification.trim().length < 5) {
      return {
        type: 'FAILURE',
        reason:
          'Supervisor manual identification requires valid supervisor ID and audit justification (min 5 chars)',
        errorCode: 'SUPERVISOR_AUTH_REQUIRED',
      };
    }
    let customer = await this.customerRepository.findById(farmerCodeOrId.trim());
    if (!customer) {
      customer = await this.customerRepository.findByFarmerCode(farmerCodeOrId.trim());
    }
    if (!customer) {
      return {
        type: 'FAILURE',
        reason: `Customer not found: ${farmerCodeOrId}`,
        errorCode: 'CUSTOMER_NOT_FOUND',
      };
    }
    return this.validateAndResolve(customer, 'SUPERVISOR_MANUAL');
  }

  private validateAndResolve(
    customer: Customer,
    method: IdentificationMethod,
    confidence?: number | null
  ): IdentificationResult {
    // 1. Validate Customer Status
    if (customer.isDeleted) {
      return {
        type: 'FAILURE',
        reason: `Customer ${customer.farmerCode} is deleted and cannot deliver milk`,
        errorCode: 'CUSTOMER_DELETED',
      };
    }
    if (customer.status !== 'ACTIVE') {
      return {
        type: 'FAILURE',
        reason: `Customer ${customer.farmerCode} is not in ACTIVE status (current: ${customer.status})`,
        errorCode: 'CUSTOMER_NOT_ACTIVE',
      };
    }

    // 2. Validate Organization
    if (customer.organizationId !== this.expectedOrganizationId) {
      return {
        type: 'FAILURE',
        reason: 'Customer belongs to another organization',
        errorCode: 'ORGANIZATION_MISMATCH',
      };
    }

    // 3. Validate Center assignment
    if (customer.primaryCenterId !== this.expectedCenterId) {
      return {
        type: 'FAILURE',
        reason: `Customer is registered at another center (${customer.primaryCenterId})`,
        errorCode: 'CENTER_MISMATCH',
      };
    }

    // 4. Validate Milk Category Permission
    if (!customer.permittedCategories || customer.permittedCategories.length === 0) {
      return {
        type: 'FAILURE',
        reason: 'Customer has no approved milk category permissions',
        errorCode: 'NO_CATEGORY_PERMISSION',
      };
    }

    // 5. Validate Offline Authorization Freshness
    if (this.maxOfflineHours === null) {
      return {
        type: 'FAILURE',
        reason:
          'Offline authorization policy is unapproved and unconfigured. Contact dairy owner for policy approval.',
        errorCode: 'OFFLINE_POLICY_UNAPPROVED',
      };
    }
    const hoursSinceSync =
      (Date.now() - this.lastSyncTimestamp) / (1000 * 3600);
    if (hoursSinceSync > this.maxOfflineHours) {
      return {
        type: 'FAILURE',
        reason: `Device offline freshness expired (${Math.round(hoursSinceSync)} hours > ${this.maxOfflineHours} hours). Sync required.`,
        errorCode: 'OFFLINE_FRESHNESS_EXPIRED',
      };
    }

    return {
      type: 'SUCCESS',
      customer,
      canonicalUuid: customer.id,
      method,
      confidenceScore: confidence,
      identifiedAt: Date.now(),
    };
  }
}
