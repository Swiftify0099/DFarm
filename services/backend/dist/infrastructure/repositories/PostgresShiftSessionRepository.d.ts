import { IShiftSessionRepository } from '../../application/ports/index.js';
import { KioskShiftSession } from '../../domain/entities/KioskShiftSession.js';
export declare class PostgresShiftSessionRepository implements IShiftSessionRepository {
    private mapRowToSession;
    private assertValidOrganizationId;
    private getAuthorizedTenantDb;
    private isConstraintOrDomainError;
    private queryTenant;
    private getBaseSelect;
    findActiveSession(centerId: string, deviceIdentifier: string, organizationId: string): Promise<KioskShiftSession | null>;
    findByCode(sessionCode: string, organizationId: string): Promise<KioskShiftSession | null>;
    findById(sessionId: string, organizationId: string): Promise<KioskShiftSession | null>;
    private validateOperatorInTenant;
    save(session: KioskShiftSession): Promise<void>;
}
//# sourceMappingURL=PostgresShiftSessionRepository.d.ts.map