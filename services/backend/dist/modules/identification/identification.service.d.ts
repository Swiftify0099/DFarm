import type { AuthContext } from '../../middleware/authenticate.js';
import { type FaceIdentificationDTO, type RfidIdentificationDTO, type SupervisorVerificationDTO, type IdentificationResultDTO, type IdentificationSessionDTO } from '@dfarm/shared-types';
export declare class IdentificationService {
    /**
     * Start a new customer identification session at a collection counter.
     */
    static startSession(params: {
        centerId: string;
        deviceId: string;
        authContext: AuthContext;
    }): IdentificationSessionDTO;
    /**
     * Method 1: Face Recognition Identification.
     *
     * Flow:
     * Live Camera -> Quality -> Liveness -> Embedding -> Local Authorized Template Search
     * -> Threshold Validation -> Customer UUID Resolution.
     *
     * CRITICAL REQUIREMENT:
     * If P07 has not produced a working face recognition engine, report that blocker
     * rather than simulating successful face matches.
     */
    static identifyByFace(dto: FaceIdentificationDTO, context: AuthContext): Promise<IdentificationResultDTO>;
    /**
     * Method 2: Software RFID Card Verification.
     *
     * Flow:
     * Normalize UID -> Look Up Active Assignment -> Check Card Status
     * -> Check Customer Status -> Check Organization -> Check Center Scope
     * -> Resolve Customer UUID.
     */
    static identifyByRfid(dto: RfidIdentificationDTO, context: AuthContext): Promise<IdentificationResultDTO>;
    /**
     * Method 3: Supervisor Manual Verification.
     *
     * Flow:
     * Face Failed/Unknown -> RFID Unavailable/Invalid -> Supervisor Login
     * -> Search Customer -> Select Candidate -> Verify Customer -> Mandatory Reason
     * -> Confirm Identity -> Generate Identification Audit.
     */
    static verifyBySupervisor(dto: SupervisorVerificationDTO, context: AuthContext): Promise<IdentificationResultDTO>;
    /**
     * Get identification session details.
     */
    static getSession(sessionId: string, context: AuthContext): IdentificationSessionDTO;
    /**
     * Query identification audit logs.
     */
    static queryAuditLogs(params: {
        centerId?: string;
        customerId?: string;
        limit?: number;
    }, context: AuthContext): Promise<any[]>;
}
//# sourceMappingURL=identification.service.d.ts.map