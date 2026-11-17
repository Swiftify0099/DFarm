import { IOtpService, ITokenService } from '../../ports/index.js';
import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';

export class RequestOperatorOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    const phone = new PhoneNumber(rawPhone);
    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);

    const sql = `
      SELECT id, full_name 
      FROM users 
      WHERE (phone_number = $1 OR phone_number LIKE $2)
        AND status = 'ACTIVE'
      LIMIT 1;
    `;
    const res = await db.query(sql, [phone.e164, `%${clean10}`]);

    if (res.rows.length === 0) {
      throw new UnauthorizedError('Mobile number is not registered as an authorized operator.');
    }

    return this.otpService.sendOtp(phone.e164, 'OPERATOR_LOGIN');
  }
}

export class VerifyOperatorOtpUseCase {
  constructor(
    private readonly otpService: IOtpService,
    private readonly tokenService: ITokenService
  ) {}

  public async execute(rawPhone: string, otp: string): Promise<{
    token: string;
    operator: {
      id: string;
      fullName: string;
      mobileNumber: string;
      role: string;
      dairyId: string;
      dairyName?: string;
      dairyCode?: string;
      centerId: string;
    };
  }> {
    const phone = new PhoneNumber(rawPhone);

    const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'OPERATOR_LOGIN');
    if (!isValid) {
      throw new DomainValidationError('Invalid or expired OTP entered.');
    }

    let row: any;
    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);
    try {
      const sql = `
        SELECT 
          u.id, 
          u.full_name, 
          u.phone_number AS mobile_number, 
          u.role AS user_role, 
          u.organization_id,
          dc.id AS center_id,
          o.name AS dairy_name,
          o.code AS dairy_code
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        LEFT JOIN dairy_centers dc ON dc.organization_id = u.organization_id
        WHERE (u.phone_number = $1 OR u.phone_number LIKE $2)
          AND u.status = 'ACTIVE'
        LIMIT 1;
      `;
      const res = await db.query(sql, [phone.e164, `%${clean10}`]);
      if (res.rows.length > 0) {
        row = res.rows[0];
      }
    } catch {
      // Query error
    }

    if (!row) {
      throw new UnauthorizedError('This mobile number is not registered as an authorized operator.');
    }

    const token = this.tokenService.signToken({
      userId: row.id,
      organizationId: row.organization_id,
      centerId: row.center_id,
      role: row.user_role || 'COLLECTION_OPERATOR',
      actorType: 'STAFF',
    });

    return {
      token,
      operator: {
        id: row.id,
        fullName: row.full_name,
        mobileNumber: row.mobile_number || phone.e164,
        role: row.user_role || 'COLLECTION_OPERATOR',
        dairyId: row.organization_id,
        dairyName: row.dairy_name || 'Dairy Cooperative',
        dairyCode: row.dairy_code || 'DAIRY',
        centerId: row.center_id,
      },
    };
  }
}
