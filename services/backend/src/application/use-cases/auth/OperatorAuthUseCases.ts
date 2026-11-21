import { IOtpService, ITokenService } from '../../ports/index.js';
import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { logger } from '../../../shared/logger/index.js';

const AUTHORIZED_OPERATOR_ROLES = new Set([
  'COLLECTION_OPERATOR',
  'SHIFT_SUPERVISOR',
  'SUPERVISOR',
  'CENTER_MANAGER',
  'PRIMARY_DAIRY_ADMIN',
  'DAIRY_ADMIN',
  'SUPER_ADMIN',
]);

const CUSTOMER_ROLES = new Set([
  'FARMER_CUSTOMER',
  'GUEST_FARMER',
  'CUSTOMER',
]);

export class RequestOperatorOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    if (!rawPhone || !rawPhone.trim()) {
      throw new DomainValidationError('Mobile number is required for operator login.');
    }

    const phone = new PhoneNumber(rawPhone);
    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);

    const sql = `
      SELECT 
        u.id, 
        u.full_name, 
        u.role, 
        u.status, 
        u.organization_id,
        o.status AS org_status,
        o.name AS org_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE (u.phone_number = $1 OR u.mobile_number = $1 OR u.normalized_mobile_number = $1
             OR u.phone_number LIKE $2 OR u.mobile_number LIKE $2 OR u.normalized_mobile_number LIKE $2)
      ORDER BY 
        (CASE WHEN u.status = 'ACTIVE' THEN 1 ELSE 2 END),
        (CASE WHEN u.role = 'COLLECTION_OPERATOR' THEN 1 WHEN u.role IN ('SHIFT_SUPERVISOR', 'SUPERVISOR') THEN 2 ELSE 3 END)
      LIMIT 1;
    `;
    const res = await db.query(sql, [phone.e164, `%${clean10}`]);

    if (res.rows.length === 0) {
      logger.warn({ mobile: phone.e164.replace(/\d(?=\d{4})/g, '*') }, 'Operator OTP rejected: mobile number not found in authorized directory');
      throw new UnauthorizedError('Mobile number is not registered as an authorized operator.');
    }

    const user = res.rows[0];

    // Check account status
    if (user.status && user.status !== 'ACTIVE') {
      logger.warn({ userId: user.id, status: user.status }, 'Operator OTP rejected: account is not active');
      throw new UnauthorizedError('Operator account is suspended or inactive.');
    }

    // Role-based authorization check
    const userRole = (user.role || '').toUpperCase();
    if (CUSTOMER_ROLES.has(userRole)) {
      logger.warn({ userId: user.id, role: userRole }, 'Operator OTP rejected: account is registered as customer, not operator');
      throw new UnauthorizedError('This mobile number is registered as a customer and is not authorized to operate collection terminals.');
    }

    if (!AUTHORIZED_OPERATOR_ROLES.has(userRole)) {
      logger.warn({ userId: user.id, role: userRole }, 'Operator OTP rejected: unauthorized role');
      throw new UnauthorizedError('Mobile number is not registered as an authorized operator.');
    }

    // Organization status check
    if (user.org_status && user.org_status !== 'ACTIVE' && userRole !== 'SUPER_ADMIN') {
      logger.warn({ userId: user.id, orgId: user.organization_id, orgStatus: user.org_status }, 'Operator OTP rejected: organization is not active');
      throw new UnauthorizedError(`Assigned dairy cooperative (${user.org_name || 'Dairy'}) is currently inactive or suspended.`);
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
      centerName?: string;
      centerCode?: string;
    };
  }> {
    if (!rawPhone || !rawPhone.trim()) {
      throw new DomainValidationError('Mobile number is required.');
    }
    if (!otp || !otp.trim()) {
      throw new DomainValidationError('OTP verification code is required.');
    }

    const phone = new PhoneNumber(rawPhone);

    const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'OPERATOR_LOGIN');
    if (!isValid) {
      throw new DomainValidationError('Invalid or expired OTP entered.');
    }

    let row: any = null;
    const clean10 = phone.e164.replace(/\D/g, '').slice(-10);
    try {
      const sql = `
        SELECT 
          u.id, 
          u.full_name, 
          COALESCE(u.phone_number, u.mobile_number, u.normalized_mobile_number) AS mobile_number, 
          u.role AS user_role, 
          u.status AS user_status,
          u.organization_id,
          uca.center_id AS assigned_center_id,
          dc_assigned.name AS assigned_center_name,
          dc_assigned.code AS assigned_center_code,
          dc_primary.id AS primary_center_id,
          dc_primary.name AS primary_center_name,
          dc_primary.code AS primary_center_code,
          o.name AS dairy_name,
          o.code AS dairy_code,
          o.status AS org_status
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        LEFT JOIN user_center_assignments uca ON uca.user_id = u.id AND uca.is_primary = TRUE
        LEFT JOIN dairy_centers dc_assigned ON dc_assigned.id = uca.center_id
        LEFT JOIN dairy_centers dc_primary ON dc_primary.organization_id = u.organization_id AND dc_primary.status = 'ACTIVE'
        WHERE (u.phone_number = $1 OR u.mobile_number = $1 OR u.normalized_mobile_number = $1
               OR u.phone_number LIKE $2 OR u.mobile_number LIKE $2 OR u.normalized_mobile_number LIKE $2)
        ORDER BY 
          (CASE WHEN u.status = 'ACTIVE' THEN 1 ELSE 2 END),
          (CASE WHEN u.role = 'COLLECTION_OPERATOR' THEN 1 WHEN u.role IN ('SHIFT_SUPERVISOR', 'SUPERVISOR') THEN 2 ELSE 3 END)
        LIMIT 1;
      `;
      const res = await db.query(sql, [phone.e164, `%${clean10}`]);
      if (res.rows.length > 0) {
        row = res.rows[0];
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Database error during operator verification query');
    }

    if (!row) {
      throw new UnauthorizedError('This mobile number is not registered as an authorized operator.');
    }

    // Validate account status
    if (row.user_status && row.user_status !== 'ACTIVE') {
      throw new UnauthorizedError('Operator account is suspended or inactive.');
    }

    // Role-based authorization
    const roleRaw = (row.user_role || '').toUpperCase();
    if (CUSTOMER_ROLES.has(roleRaw)) {
      throw new UnauthorizedError('This account is registered as a customer and is not authorized to operate collection terminals.');
    }

    if (!AUTHORIZED_OPERATOR_ROLES.has(roleRaw)) {
      throw new UnauthorizedError('This mobile number is not registered as an authorized operator.');
    }

    // Validate organization status
    if (row.org_status && row.org_status !== 'ACTIVE' && roleRaw !== 'SUPER_ADMIN') {
      throw new UnauthorizedError(`Assigned dairy cooperative (${row.dairy_name || 'Dairy'}) is currently inactive or suspended.`);
    }

    // Resolve assigned center
    let centerId = row.assigned_center_id || row.primary_center_id;
    let centerName = row.assigned_center_name || row.primary_center_name || 'Main Collection Center';
    let centerCode = row.assigned_center_code || row.primary_center_code || 'C-01';

    // If center ID is still missing, attempt fallback query on dairy_centers
    if (!centerId && row.organization_id) {
      try {
        const centerRes = await db.query(
          `SELECT id, name, code FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`,
          [row.organization_id]
        );
        if (centerRes.rows.length > 0) {
          centerId = centerRes.rows[0].id;
          centerName = centerRes.rows[0].name;
          centerCode = centerRes.rows[0].code;
        }
      } catch {}
    }

    // Fallback dummy center if still empty to ensure JWT validity
    if (!centerId) {
      centerId = '00000000-0000-0000-0000-000000000002';
    }

    const effectiveRole = roleRaw === 'SUPER_ADMIN'
      ? 'SUPER_ADMIN'
      : (roleRaw === 'PRIMARY_DAIRY_ADMIN' || roleRaw === 'DAIRY_ADMIN' ? 'DAIRY_ADMIN' : 'COLLECTION_OPERATOR');

    const token = this.tokenService.signToken({
      userId: row.id,
      organizationId: row.organization_id,
      centerId: centerId,
      role: effectiveRole,
      actorType: 'STAFF',
    });

    return {
      token,
      operator: {
        id: row.id,
        fullName: row.full_name,
        mobileNumber: row.mobile_number || phone.e164,
        role: effectiveRole,
        dairyId: row.organization_id,
        dairyName: row.dairy_name || 'Dairy Cooperative',
        dairyCode: row.dairy_code || 'DAIRY',
        centerId: centerId,
        centerName: centerName,
        centerCode: centerCode,
      },
    };
  }
}
