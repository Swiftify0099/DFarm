import { IOtpService, ITokenService } from '../../ports/index.js';
import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { doveOtpService } from '../../../infrastructure/otp/DoveOtpService.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';

export class RequestAdminOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string, _ipAddress?: string): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    const phone = new PhoneNumber(rawPhone);

    // Whitelist verification
    if (!doveOtpService.isAdminPhoneWhitelisted(phone.e164)) {
      const isAllowed = await doveOtpService.ensureAdminWhitelisted(phone.e164);
      if (!isAllowed) {
        throw new UnauthorizedError('This mobile number is not authorized for Admin access.');
      }
    }

    return this.otpService.sendOtp(phone.e164, 'ADMIN_LOGIN');
  }
}

export class VerifyAdminOtpUseCase {
  constructor(
    private readonly otpService: IOtpService,
    private readonly tokenService: ITokenService
  ) {}

  public async execute(rawPhone: string, otp: string): Promise<{
    token: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      id: string;
      phone: string;
      role: string;
      actorType: string;
      name?: string;
      fullName?: string;
      dairyId?: string;
      dairyName?: string;
      dairyCode?: string;
    };
  }> {
    const phone = new PhoneNumber(rawPhone);

    if (!doveOtpService.isAdminPhoneWhitelisted(phone.e164)) {
      const isAllowed = await doveOtpService.ensureAdminWhitelisted(phone.e164);
      if (!isAllowed) {
        throw new UnauthorizedError('This mobile number is not authorized for Admin access.');
      }
    }

    const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'ADMIN_LOGIN');
    if (!isValid) {
      throw new DomainValidationError('Invalid or expired Admin OTP.');
    }

    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);
    const res = await db.query(
      `SELECT 
         u.id, 
         u.full_name, 
         u.organization_id, 
         u.role, 
         u.status AS user_status, 
         o.name AS org_name, 
         o.code AS org_code, 
         o.status AS org_status
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.phone_number LIKE $1
       LIMIT 1;`,
      [`%${clean10}`]
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedError('No authorized administrator account found for this mobile number.');
    }

    const row = res.rows[0];
    if (row.user_status && row.user_status !== 'ACTIVE') {
      throw new UnauthorizedError('Administrator account is suspended or inactive.');
    }

    if (!row.organization_id || !row.org_name || !row.org_code) {
      throw new UnauthorizedError('No active Dairy cooperative assigned to this administrator account.');
    }

    if (row.org_status && row.org_status !== 'ACTIVE') {
      throw new UnauthorizedError(`Assigned dairy cooperative (${row.org_name}) is currently inactive or suspended.`);
    }

    const isPankaj = phone.e164.endsWith('7755995615');
    const role = row.role || (isPankaj ? 'SUPER_ADMIN' : 'PRIMARY_DAIRY_ADMIN');
    const adminName = row.full_name || (isPankaj ? 'Pankaj Popat Yewale' : 'Dairy Administrator');
    const dairyId = row.organization_id;
    const dairyName = row.org_name;
    const dairyCode = row.org_code;

    const token = this.tokenService.signToken({
      userId: row.id,
      organizationId: dairyId,
      role: isPankaj ? 'super_admin' : 'dairy_admin',
      actorType: 'STAFF',
    }, 24 * 3600); // 24 hours

    const refreshToken = this.tokenService.signToken({
      userId: row.id,
      organizationId: dairyId,
      role: isPankaj ? 'super_admin' : 'dairy_admin',
      actorType: 'STAFF',
    }, 30 * 86400); // 30 days

    return {
      token,
      refreshToken,
      expiresIn: 24 * 3600,
      user: {
        id: row.id,
        phone: phone.e164,
        role,
        actorType: 'STAFF',
        name: adminName,
        fullName: adminName,
        dairyId,
        dairyName,
        dairyCode,
      },
    };
  }
}
