import type { RfidCardStatus, RfidTechnology, SupervisorReasonCategory, CustomerStatus } from './enums.js';
export interface RfidCard {
    id: string;
    organizationId: string;
    cardUid: string;
    cardType: RfidTechnology;
    status: RfidCardStatus;
    createdAt: string;
    updatedAt: string;
}
export interface RfidCardAssignment {
    id: string;
    rfidCardId: string;
    customerId: string;
    centerId: string;
    isActive: boolean;
    assignedAt: string;
    assignedBy: string;
    revokedAt?: string | null;
    revokedBy?: string | null;
    revocationReason?: string | null;
    cardUid?: string;
}
export interface RfidAssignDTO {
    customerId: string;
    cardUid: string;
    cardType?: RfidTechnology;
    centerId?: string;
    deviceId?: string;
    note?: string;
}
export interface RfidReplaceDTO {
    customerId: string;
    newCardUid: string;
    cardType?: RfidTechnology;
    reasonCategory: SupervisorReasonCategory | string;
    justificationNotes: string;
    centerId?: string;
    deviceId?: string;
}
export interface RfidRevokeDTO {
    cardId: string;
    status: RfidCardStatus.REVOKED | RfidCardStatus.LOST | RfidCardStatus.BLOCKED;
    reason: string;
}
export interface CustomerRfidStatusDTO {
    customerId: string;
    customerStatus: CustomerStatus;
    registrationStatus: string;
    activeCard: {
        assignmentId: string;
        cardId: string;
        cardUid: string;
        cardType: RfidTechnology;
        assignedAt: string;
    } | null;
    assignmentHistory: Array<{
        assignmentId: string;
        cardId: string;
        cardUid: string;
        isActive: boolean;
        assignedAt: string;
        assignedBy: string;
        revokedAt?: string | null;
        revocationReason?: string | null;
    }>;
}
//# sourceMappingURL=rfid.d.ts.map