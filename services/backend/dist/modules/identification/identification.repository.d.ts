import type { IdentificationMethod, VerificationOutcome, SupervisorReasonCategory, SupervisorAuthMethod, CustomerStatus } from '@dfarm/shared-types';
export interface AuditLogInsertParams {
    organizationId: string;
    centerId: string;
    sessionId?: string | null;
    customerId?: string | null;
    identificationMethod: IdentificationMethod;
    verificationOutcome: VerificationOutcome;
    faceModelVersionId?: string | null;
    faceMatchScore?: number | null;
    rfidCardUidScanned?: string | null;
    supervisorId?: string | null;
    supervisorReasonCode?: string | null;
    deviceId: string;
}
export interface SupervisorRecordInsertParams {
    auditLogId: string;
    supervisorId: string;
    customerId: string;
    centerId: string;
    reasonCategory: SupervisorReasonCategory;
    justificationNotes: string;
    authenticatedVia?: SupervisorAuthMethod;
}
export declare class IdentificationRepository {
    /**
     * Commit an identification attempt audit log.
     * Protects audit logs as append-only.
     */
    static recordAuditLog(params: AuditLogInsertParams): Promise<string>;
    /**
     * Commit a supervisor manual verification record linked to an audit log.
     */
    static recordSupervisorVerification(params: SupervisorRecordInsertParams): Promise<string>;
    /**
     * Find an active customer with their card and registration info.
     */
    static findActiveFaceEnrollment(customerId: string): Promise<{
        id: string;
        status: string;
        modelVersionId: string;
    } | null>;
    /**
     * Find an active customer with their card and registration info.
     */
    static findCustomerById(customerId: string, organizationId: string): Promise<{
        id: string;
        organizationId: string;
        primaryCenterId: string;
        farmerCode: string;
        fullName: string;
        status: CustomerStatus;
        isDeleted: boolean;
        permittedCategories: string[];
    } | null>;
    /**
     * Resolve customer via RFID card UID.
     */
    static findCustomerByRfidCard(normalizedCardUid: string, organizationId: string): Promise<{
        customerId: string;
        cardId: string;
        cardStatus: string;
        isAssignmentActive: boolean;
        customerDeleted: boolean;
        customerStatus: CustomerStatus;
        customerName: string;
        farmerCode: string;
        primaryCenterId: string;
        permittedCategories: string[];
    } | null>;
    /**
     * Verify supervisor credentials and center authorization.
     */
    static verifySupervisorAuthorization(supervisorId: string, centerId: string, organizationId: string): Promise<{
        isValid: boolean;
        role: string;
        fullName: string;
    } | null>;
    /**
     * Query recent identification audit logs.
     */
    static queryAuditLogs(params: {
        organizationId: string;
        centerId?: string;
        customerId?: string;
        limit?: number;
    }): Promise<any[]>;
}
//# sourceMappingURL=identification.repository.d.ts.map