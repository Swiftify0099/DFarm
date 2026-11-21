import { IShiftSessionRepository } from '../../application/ports/index.js';
import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
export declare class PostgresShiftSessionRepository implements IShiftSessionRepository {
    private mapRowToSession;
    private getDb;
    findActiveSession(centerId: string, deviceIdentifier: string, organizationId?: string): Promise<KioskShiftSession | null>;
    findByCode(sessionCode: string, organizationId?: string): Promise<KioskShiftSession | null>;
    findById(sessionId: string, organizationId?: string): Promise<KioskShiftSession | null>;
    save(session: KioskShiftSession): Promise<void>;
}
//# sourceMappingURL=PostgresShiftSessionRepository.d.ts.map