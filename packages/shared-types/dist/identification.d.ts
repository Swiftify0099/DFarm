import type { IdentificationMethod, IdentificationState, VerificationOutcome, SupervisorReasonCategory, SupervisorAuthMethod, CustomerStatus } from './enums.js';
export interface IdentificationAttempt {
    method: IdentificationMethod;
    outcome: VerificationOutcome;
    timestamp: string;
    details?: Record<string, unknown>;
}
export interface IdentificationSessionDTO {
    sessionId: string;
    organizationId: string;
    centerId: string;
    deviceId: string;
    currentState: IdentificationState;
    resolvedCustomerUuid: string | null;
    customerName: string | null;
    farmerCode: string | null;
    identificationMethod: IdentificationMethod | null;
    attempts: IdentificationAttempt[];
    createdAt: string;
    updatedAt: string;
}
export interface FaceIdentificationDTO {
    sessionId?: string;
    deviceId: string;
    centerId: string;
    probeEmbedding?: number[] | null;
    qualityScore?: number;
}
export interface RfidIdentificationDTO {
    sessionId?: string;
    cardUid: string;
    deviceId: string;
    centerId: string;
}
export interface SupervisorVerificationDTO {
    sessionId?: string;
    targetCustomerUuid: string;
    reasonCategory: SupervisorReasonCategory;
    justificationNotes: string;
    authenticatedVia: SupervisorAuthMethod;
    deviceId: string;
    centerId: string;
    supervisorId?: string;
    supervisorPin?: string;
}
export interface IdentificationResultDTO {
    success: boolean;
    sessionId: string;
    currentState: IdentificationState;
    customerUuid: string | null;
    method: IdentificationMethod | null;
    auditLogId: string | null;
    message: string;
    customer?: {
        id: string;
        fullName: string;
        farmerCode: string;
        status: CustomerStatus;
        permittedCategories?: string[];
    };
    rejectionReason?: string;
}
//# sourceMappingURL=identification.d.ts.map