import { IShiftSessionRepository } from '../../ports/index.js';
import { KioskShiftSession, ShiftType } from '../../../domain/entities/KioskShiftSession.js';
export declare class GetActiveShiftSessionUseCase {
    private readonly sessionRepo;
    constructor(sessionRepo: IShiftSessionRepository);
    execute(params: {
        centerId: string;
        organizationId: string;
        operatorId: string;
        operatorName: string;
        deviceIdentifier?: string;
        deviceName?: string;
    }): Promise<KioskShiftSession>;
}
export declare class OpenShiftSessionUseCase {
    private readonly sessionRepo;
    constructor(sessionRepo: IShiftSessionRepository);
    execute(params: {
        centerId: string;
        organizationId: string;
        operatorId: string;
        operatorName: string;
        shift?: ShiftType;
        businessDate?: string;
        deviceIdentifier?: string;
        deviceName?: string;
    }): Promise<KioskShiftSession>;
}
export declare class CloseShiftSessionUseCase {
    private readonly sessionRepo;
    constructor(sessionRepo: IShiftSessionRepository);
    execute(params: {
        sessionCode: string;
        operatorId: string;
        operatorName: string;
    }): Promise<KioskShiftSession>;
}
//# sourceMappingURL=ShiftSessionUseCases.d.ts.map