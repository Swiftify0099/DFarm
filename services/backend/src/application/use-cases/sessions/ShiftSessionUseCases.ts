import crypto from 'node:crypto';
import { IShiftSessionRepository } from '../../ports/index.js';
import { KioskShiftSession, ShiftType } from '../../../domain/entities/KioskShiftSession.js';
import { DomainValidationError, SessionConflictError } from '../../../domain/errors/index.js';

function assertRequiredContext(params: {
  organizationId?: string;
  centerId?: string;
  operatorId?: string;
}): { organizationId: string; centerId?: string; operatorId?: string } {
  if (!params.organizationId || !params.organizationId.trim()) {
    throw new DomainValidationError('Authenticated organization ID is required.', 'MISSING_ORGANIZATION_ID');
  }
  return {
    organizationId: params.organizationId.trim(),
    centerId: params.centerId?.trim(),
    operatorId: params.operatorId?.trim(),
  };
}

export class GetActiveShiftSessionUseCase {
  constructor(private readonly sessionRepo: IShiftSessionRepository) {}

  public async execute(params: {
    centerId: string;
    organizationId: string;
    operatorId: string;
    operatorName: string;
    deviceIdentifier?: string;
    deviceName?: string;
    timezone?: string;
  }): Promise<KioskShiftSession> {
    const ctx = assertRequiredContext(params);
    if (!ctx.centerId) {
      throw new DomainValidationError('Collection center ID is required.', 'MISSING_CENTER_ID');
    }
    if (!ctx.operatorId) {
      throw new DomainValidationError('Authenticated operator ID is required.', 'MISSING_OPERATOR_ID');
    }

    const deviceId = (params.deviceIdentifier || 'KIOSK_MAIN').trim();
    const existing = await this.sessionRepo.findActiveSession(ctx.centerId, deviceId, ctx.organizationId);
    if (existing) {
      return existing;
    }

    // Auto-open a session for current date & shift using authoritative timezone
    const now = new Date();
    const tz = params.timezone || 'Asia/Kolkata';
    let businessDate: string;
    let currentHour: number;
    try {
      businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
      const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now);
      currentHour = parseInt(hourStr, 10) || now.getHours();
    } catch {
      businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      currentHour = now.getHours();
    }

    const shift: ShiftType = currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING';
    const datePart = businessDate.replace(/-/g, '');
    const baseCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;

    // Check if session for today & shift already exists in database
    const existingWithCode = await this.sessionRepo.findByCode(baseCode, ctx.organizationId);
    if (existingWithCode) {
      // If it exists in the database (even if CLOSED), return it so UI accurately displays session state
      return existingWithCode;
    }

    const newSession = new KioskShiftSession({
      id: crypto.randomUUID(),
      sessionCode: baseCode,
      organizationId: ctx.organizationId,
      centerId: ctx.centerId,
      businessDate,
      shift,
      status: 'OPEN',
      openedAt: now.toISOString(),
      closedAt: null,
      openingOperatorId: ctx.operatorId,
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
      timezone: tz,
    });

    try {
      await this.sessionRepo.save(newSession);
      return newSession;
    } catch (err: any) {
      if (err instanceof SessionConflictError) {
        const concurrentWinner = await this.sessionRepo.findActiveSession(ctx.centerId, deviceId, ctx.organizationId);
        if (concurrentWinner) {
          return concurrentWinner;
        }
      }
      throw err;
    }
  }
}

export class OpenShiftSessionUseCase {
  constructor(private readonly sessionRepo: IShiftSessionRepository) {}

  public async execute(params: {
    centerId: string;
    organizationId: string;
    operatorId: string;
    operatorName: string;
    shift?: ShiftType;
    businessDate?: string;
    deviceIdentifier?: string;
    deviceName?: string;
    timezone?: string;
  }): Promise<KioskShiftSession> {
    const ctx = assertRequiredContext(params);
    if (!ctx.centerId) {
      throw new DomainValidationError('Collection center ID is required.', 'MISSING_CENTER_ID');
    }
    if (!ctx.operatorId) {
      throw new DomainValidationError('Authenticated operator ID is required.', 'MISSING_OPERATOR_ID');
    }

    const deviceId = (params.deviceIdentifier || 'KIOSK_MAIN').trim();
    const existing = await this.sessionRepo.findActiveSession(ctx.centerId, deviceId, ctx.organizationId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const tz = params.timezone || 'Asia/Kolkata';
    let currentHour: number;
    let computedDate: string;
    try {
      computedDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
      const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now);
      currentHour = parseInt(hourStr, 10) || now.getHours();
    } catch {
      computedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      currentHour = now.getHours();
    }

    const shift: ShiftType = params.shift || (currentHour >= 4 && currentHour < 15 ? 'MORNING' : 'EVENING');
    const businessDate = params.businessDate || computedDate;
    const datePart = businessDate.replace(/-/g, '');
    const baseCode = `SH-${datePart}-${shift[0]}-${deviceId.substring(0, 4).toUpperCase()}`;

    // Find a unique, unconflicted session code (e.g. baseCode or baseCode-02 if previous session was concluded)
    let sessionCode = baseCode;
    let existingWithCode = await this.sessionRepo.findByCode(sessionCode, ctx.organizationId);
    let counter = 2;
    while (existingWithCode) {
      if (existingWithCode.isOpen && existingWithCode.centerId === ctx.centerId && existingWithCode.deviceIdentifier === deviceId) {
        return existingWithCode;
      }
      sessionCode = `${baseCode}-${String(counter).padStart(2, '0')}`;
      existingWithCode = await this.sessionRepo.findByCode(sessionCode, ctx.organizationId);
      counter++;
      if (counter > 99) break;
    }

    const newSession = new KioskShiftSession({
      id: crypto.randomUUID(),
      sessionCode,
      organizationId: ctx.organizationId,
      centerId: ctx.centerId,
      businessDate,
      shift,
      status: 'OPEN',
      openedAt: now.toISOString(),
      closedAt: null,
      openingOperatorId: ctx.operatorId,
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
      timezone: tz,
    });

    try {
      await this.sessionRepo.save(newSession);
      return newSession;
    } catch (err: any) {
      if (err instanceof SessionConflictError) {
        const concurrentWinner = await this.sessionRepo.findActiveSession(ctx.centerId, deviceId, ctx.organizationId);
        if (concurrentWinner) {
          return concurrentWinner;
        }
      }
      throw err;
    }
  }
}

export class CloseShiftSessionUseCase {
  constructor(private readonly sessionRepo: IShiftSessionRepository) {}

  public async execute(params: {
    sessionCode: string;
    operatorId: string;
    operatorName: string;
    organizationId: string;
  }): Promise<KioskShiftSession> {
    const ctx = assertRequiredContext({ organizationId: params.organizationId, operatorId: params.operatorId });
    if (!params.sessionCode || !params.sessionCode.trim()) {
      throw new DomainValidationError('Session code is required.', 'INVALID_SESSION_CODE');
    }

    const session = await this.sessionRepo.findByCode(params.sessionCode.trim(), ctx.organizationId);
    if (!session) {
      throw new DomainValidationError(`Shift session ${params.sessionCode} was not found.`, 'SESSION_NOT_FOUND');
    }

    session.close(params.operatorId, params.operatorName);
    await this.sessionRepo.save(session);
    return session;
  }
}

export class ReopenShiftSessionUseCase {
  constructor(private readonly sessionRepo: IShiftSessionRepository) {}

  public async execute(params: {
    sessionCode: string;
    operatorId?: string;
    operatorName?: string;
    organizationId: string;
  }): Promise<KioskShiftSession> {
    const ctx = assertRequiredContext({ organizationId: params.organizationId });
    if (!params.sessionCode || !params.sessionCode.trim()) {
      throw new DomainValidationError('Session code is required.', 'INVALID_SESSION_CODE');
    }

    const session = await this.sessionRepo.findByCode(params.sessionCode.trim(), ctx.organizationId);
    if (!session) {
      throw new DomainValidationError(`Shift session ${params.sessionCode} was not found.`, 'SESSION_NOT_FOUND');
    }

    session.reopen(params.operatorId, params.operatorName);
    await this.sessionRepo.save(session);
    return session;
  }
}
