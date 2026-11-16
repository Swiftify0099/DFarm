import { IShiftSessionRepository } from '../../application/ports/index.js';
import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
export declare class PostgresShiftSessionRepository implements IShiftSessionRepository {
    private mapRowToSession;
    findActiveSession(centerId: string, deviceIdentifier: string): Promise<KioskShiftSession | null>;
    findByCode(sessionCode: string): Promise<KioskShiftSession | null>;
    save(session: KioskShiftSession): Promise<void>;
}
//# sourceMappingURL=PostgresShiftSessionRepository.d.ts.map