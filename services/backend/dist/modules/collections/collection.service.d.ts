import { MilkCategory, ReadingSource, Shift } from '@dfarm/shared-types';
import { AuthContext } from '../../middleware/authenticate.js';
export interface CreateSessionDTO {
    customerId: string;
    centerId: string;
    deviceId?: string;
    identificationMethod: 'FACE' | 'RFID' | 'SUPERVISOR_MANUAL';
    milkCategory: MilkCategory;
    shift?: Shift;
    businessDate?: string;
    intakeSequenceUuid?: string;
}
export interface RecordMeasurementsDTO {
    fatPercentage?: number;
    snfPercentage?: number;
    clr?: number;
    netWeight?: number;
    source?: ReadingSource;
}
export interface CompleteSessionDTO {
    clientIntakeUuid: string;
    idempotencyKey?: string;
    netWeight: number;
    fatPercentage: number;
    snfPercentage?: number;
    clr?: number;
    source?: ReadingSource;
    deviceId?: string;
}
export interface SupervisorAdjustmentDTO {
    supervisorId?: string;
    adjustmentType: 'CORRECTION' | 'FULL_REVERSAL';
    reason: string;
    adjustedNetWeight?: number;
    adjustedFatPercentage?: number;
    adjustedSnfPercentage?: number;
}
export declare class CollectionService {
    /**
     * Creates a new milk collection session via database stored procedure.
     */
    static createSession(dto: CreateSessionDTO, context: AuthContext): Promise<any>;
    /**
     * Ingests Fat/SNF/Weight measurements into active session.
     */
    static recordMeasurements(sessionId: string, dto: RecordMeasurementsDTO, context: AuthContext): Promise<any>;
    /**
     * Completes a milk collection session atomically via PostgreSQL stored procedure.
     * Performs server-authoritative rate calculation and atomic double-entry ledger posting.
     */
    static completeSession(sessionId: string, dto: CompleteSessionDTO, context: AuthContext): Promise<{
        session: {
            id: any;
            session_state: any;
        };
        collection: {
            id: any;
            total_amount: any;
        };
        ledger: {
            newBalance: any;
            previousBalance: any;
        };
        receipt: {
            receiptNumber: any;
        };
        status: string;
    }>;
    /**
     * Safely cancels an active session with an audit reason.
     */
    static cancelSession(sessionId: string, reason: string, context: AuthContext): Promise<any>;
    /**
     * Supervisor adjustment / reversal with full audit trail.
     */
    static adjustCollection(sessionId: string, dto: SupervisorAdjustmentDTO, context: AuthContext): Promise<any>;
    /**
     * Generates a 40-column thermal receipt slip text.
     */
    static getReceiptText(sessionId: string, _context: AuthContext): Promise<string>;
    static getShiftSummary(centerId: string, shift: Shift, date: string, _context: AuthContext): Promise<{
        centerId: string | null;
        shift: Shift;
        businessDate: string;
        totalCollections: number;
        totalWeightKg: number;
        averageFat: number;
        averageSnf: number;
        totalAmount: number;
    }>;
    static getHistory(centerId?: string, date?: string, shift?: Shift, _context?: AuthContext, limit?: number): Promise<any[]>;
    static getCustomerCollections(customerId: string, filters: {
        startDate?: string;
        endDate?: string;
        category?: string;
        shift?: string;
        limit?: number;
        offset?: number;
    }, auth: AuthContext): Promise<{
        customerId: string;
        total: number;
        limit: number;
        offset: number;
        collections: {
            sessionId: any;
            collectionId: any;
            customerId: any;
            farmerCode: any;
            customerName: any;
            milkCategory: any;
            shiftType: any;
            businessDate: any;
            sessionState: any;
            netWeight: number;
            measurementUnit: any;
            fatPercentage: number;
            snfPercentage: number;
            appliedRatePerUnit: number;
            totalAmount: number;
            receiptNumber: any;
            startedAt: any;
            completedAt: any;
        }[];
    }>;
}
//# sourceMappingURL=collection.service.d.ts.map