import type { RfidCard, RfidCardAssignment, CustomerRfidStatusDTO } from '@dfarm/shared-types';
import { RfidTechnology, CustomerStatus } from '@dfarm/shared-types';
export declare class RfidRepository {
    /**
     * Find an RFID card record by card UID within an organization.
     */
    static findCardByUid(cardUid: string, organizationId: string): Promise<RfidCard | null>;
    /**
     * Find an RFID card by its internal UUID.
     */
    static findCardById(cardId: string, organizationId: string): Promise<RfidCard | null>;
    /**
     * Find the current active assignment for a given card UID.
     */
    static findActiveAssignmentByCardUid(cardUid: string, organizationId: string): Promise<(RfidCardAssignment & {
        customerOrgId: string;
        customerStatus: CustomerStatus;
        customerDeleted: boolean;
        customerName: string;
        farmerCode: string;
        primaryCenterId: string;
    }) | null>;
    /**
     * Find the current active card assignment for a given customer.
     */
    static findActiveAssignmentByCustomerId(customerId: string): Promise<(RfidCardAssignment & {
        cardUid: string;
        cardType: RfidTechnology;
    }) | null>;
    /**
     * Create or get an RFID card in the organization inventory.
     */
    static upsertCard(organizationId: string, cardUid: string, cardType?: RfidTechnology): Promise<RfidCard>;
    /**
     * Assign an RFID card to a customer.
     * If customer is currently PENDING_RFID_ASSIGNMENT, updates them to ACTIVE & COMPLETED.
     */
    static createAssignment(params: {
        cardId: string;
        customerId: string;
        centerId: string;
        assignedBy: string;
        organizationId: string;
    }): Promise<RfidCardAssignment>;
    /**
     * Replace an active RFID card with a new card.
     * Atomically revokes previous card and assigns the new card.
     */
    static replaceAssignment(params: {
        previousAssignmentId: string;
        previousCardId: string;
        newCardId: string;
        customerId: string;
        centerId: string;
        replacedBy: string;
        revocationReason: string;
        organizationId: string;
        newOldCardStatus?: 'REVOKED' | 'LOST';
    }): Promise<RfidCardAssignment>;
    /**
     * Revoke an RFID card and deactivate any active assignment.
     */
    static revokeCard(params: {
        cardId: string;
        status: 'REVOKED' | 'LOST' | 'BLOCKED';
        reason: string;
        revokedBy: string;
        organizationId: string;
    }): Promise<{
        affectedCustomerIds: string[];
    }>;
    /**
     * Get complete RFID status and assignment history for a customer.
     */
    static getCustomerRfidStatus(customerId: string, organizationId: string): Promise<CustomerRfidStatusDTO | null>;
}
//# sourceMappingURL=rfid.repository.d.ts.map