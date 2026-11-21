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
        const existing = await this.sessionRepo.findActiveSession(params.centerId, deviceId, params.organizationId);
        if (existing) {
            return existing;
        }
        // Auto-open a session for current date & shift
        const now = new Date();
        const currentHour = now.getHours();
        const shift = currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING';
        const businessDate = now.toISOString().split('T')[0] || '';
        const datePart = businessDate.replace(/-/g, '');
        const baseCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;
        // Check if session for today & shift already exists in database
        const existingWithCode = await this.sessionRepo.findByCode(baseCode, params.organizationId);
        if (existingWithCode) {
            // If it exists in the database (even if CLOSED), return it so UI accurately displays session state
            return existingWithCode;
        }
        const newSession = new KioskShiftSession({
            id: crypto.randomUUID(),
            sessionCode: baseCode,
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
        const existing = await this.sessionRepo.findActiveSession(params.centerId, deviceId, params.organizationId);
        if (existing) {
            return existing;
        }
        const now = new Date();
        const currentHour = now.getHours();
        const shift = params.shift || (currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING');
        const businessDate = params.businessDate || now.toISOString().split('T')[0] || '';
        const datePart = businessDate.replace(/-/g, '');
        const baseCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;
        // Find a unique, unconflicted session code (e.g. baseCode or baseCode-02 if previous session was concluded)
        let sessionCode = baseCode;
        let existingWithCode = await this.sessionRepo.findByCode(sessionCode, params.organizationId);
        let counter = 2;
        while (existingWithCode) {
            if (existingWithCode.isOpen) {
                return existingWithCode;
            }
            sessionCode = `${baseCode}-${String(counter).padStart(2, '0')}`;
            existingWithCode = await this.sessionRepo.findByCode(sessionCode, params.organizationId);
            counter++;
            if (counter > 99)
                break;
        }
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
        const session = await this.sessionRepo.findByCode(params.sessionCode, params.organizationId);
        if (!session) {
            throw new DomainValidationError(`Shift session ${params.sessionCode} was not found.`);
        }
        session.close(params.operatorId, params.operatorName);
        await this.sessionRepo.save(session);
        return session;
    }
}
export class ReopenShiftSessionUseCase {
    sessionRepo;
    constructor(sessionRepo) {
        this.sessionRepo = sessionRepo;
    }
    async execute(params) {
        const session = await this.sessionRepo.findByCode(params.sessionCode, params.organizationId);
        if (!session) {
            throw new DomainValidationError(`Shift session ${params.sessionCode} was not found.`);
        }
        session.reopen(params.operatorId, params.operatorName);
        await this.sessionRepo.save(session);
        return session;
    }
}
//# sourceMappingURL=ShiftSessionUseCases.js.map