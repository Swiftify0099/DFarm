import type { AuthContext } from '../../middleware/authenticate.js';
import { type RfidAssignDTO, type RfidReplaceDTO, type RfidRevokeDTO, type CustomerRfidStatusDTO } from '@dfarm/shared-types';
export declare class RfidService {
    /**
     * Assign an RFID card to a customer.
     */
    static assignRfidCard(dto: RfidAssignDTO, context: AuthContext): Promise<{
        assignmentId: string;
        cardUid: string;
        customerId: string;
        status: string;
        [key: string]: any;
    }>;
    /**
     * Replace a customer's active RFID card with a new card.
     */
    static replaceRfidCard(dto: RfidReplaceDTO, context: AuthContext): Promise<{
        newAssignmentId: string;
        previousCardUid: string;
        newCardUid: string;
        customerId: string;
    }>;
    /**
     * Revoke an RFID card.
     */
    static revokeRfidCard(cardId: string, dto: RfidRevokeDTO, context: AuthContext): Promise<{
        cardId: string;
        status: string;
        affectedCustomerIds: string[];
    }>;
    /**
     * Block an RFID card.
     */
    static blockRfidCard(cardId: string, reason: string, context: AuthContext): Promise<{
        cardId: string;
        status: string;
    }>;
    /**
     * Get RFID status and history for a customer.
     */
    static getCustomerRfidStatus(customerId: string, context: AuthContext): Promise<CustomerRfidStatusDTO>;
}
//# sourceMappingURL=rfid.service.d.ts.map