import crypto from 'node:crypto';
import { KioskShiftSession } from '../../../domain/entities/KioskShiftSession.js';
import { DomainValidationError } from '../../../domain/errors/index.js';
export class GetActiveShiftSessionUseCase {
    sessionRepo;
    constructor(sessionRepo) {
        this.sessionRepo = sessionRepo;
    }
    async execute(params) {
        const deviceId = params.deviceIdentifier || 'KIOSK_MAIN';
        const existing = await this.sessionRepo.findActiveSession(params.centerId, deviceId);
        if (existing) {
            return existing;
        }
        // Auto-open a session for current date & shift
        const now = new Date();
        const currentHour = now.getHours();
        const shift = currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING';
        const businessDate = now.toISOString().split('T')[0] || '';
        const datePart = businessDate.replace(/-/g, '');
        const sessionCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;
        const newSession = new KioskShiftSession({
            id: crypto.randomUUID(),
            sessionCode,
            organizationId: params.organizationId,
            centerId: params.centerId,
            businessDate,
            shift,
            status: 'OPEN',
            openedAt: now.toISOString(),
            closedAt: null,
            openingOperatorId: params.operatorId,
            openingOperatorName: params.operatorName,
            deviceIdentifier: deviceId,
            deviceName: params.deviceName || 'Counter Kiosk',
            totalLiters: 0.0,
            cowLiters: 0.0,
            buffaloLiters: 0.0,
            transactionCount: 0,
            totalAmount: 0.0,
            averageFat: 0.0,
            averageSnf: 0.0,
        });
        await this.sessionRepo.save(newSession);
        return newSession;
    }
}
export class OpenShiftSessionUseCase {
    sessionRepo;
    constructor(sessionRepo) {
        this.sessionRepo = sessionRepo;
    }
    async execute(params) {
        const deviceId = params.deviceIdentifier || 'KIOSK_MAIN';
        const existing = await this.sessionRepo.findActiveSession(params.centerId, deviceId);
        if (existing) {
            return existing;
        }
        const now = new Date();
        const currentHour = now.getHours();
        const shift = params.shift || (currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING');
        const businessDate = params.businessDate || now.toISOString().split('T')[0] || '';
        const datePart = businessDate.replace(/-/g, '');
        const sessionCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;
        const newSession = new KioskShiftSession({
            id: crypto.randomUUID(),
            sessionCode,
            organizationId: params.organizationId,
            centerId: params.centerId,
            businessDate,
            shift,
            status: 'OPEN',
            openedAt: now.toISOString(),
            closedAt: null,
            openingOperatorId: params.operatorId,
            openingOperatorName: params.operatorName,
            deviceIdentifier: deviceId,
            deviceName: params.deviceName || 'Counter Kiosk',
            totalLiters: 0.0,
            cowLiters: 0.0,
            buffaloLiters: 0.0,
            transactionCount: 0,
            totalAmount: 0.0,
            averageFat: 0.0,
            averageSnf: 0.0,
        });
        await this.sessionRepo.save(newSession);
        return newSession;
    }
}
export class CloseShiftSessionUseCase {
    sessionRepo;
    constructor(sessionRepo) {
        this.sessionRepo = sessionRepo;
    }
    async execute(params) {
        const session = await this.sessionRepo.findByCode(params.sessionCode);
        if (!session) {
            throw new DomainValidationError(`Shift session ${params.sessionCode} was not found.`);
        }
        session.close(params.operatorId, params.operatorName);
        await this.sessionRepo.save(session);
        return session;
    }
}
//# sourceMappingURL=ShiftSessionUseCases.js.map