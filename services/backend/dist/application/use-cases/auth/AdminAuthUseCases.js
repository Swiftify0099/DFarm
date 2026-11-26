import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { ALLOWED_ADMIN_ROLES, PLATFORM_ADMIN_ROLES } from '../../../infrastructure/otp/DoveOtpService.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { logger } from '../../../shared/logger/index.js';
export async function resolveActiveAdminByPhone(e164Phone) {
    const clean10 = e164Phone.replace(/\D/g, '').slice(-10);
    if (clean10.length !== 10) {
        throw new UnauthorizedError('This mobile number is not authorized for Admin access.');
    }
    let res;
    try {
        res = await db.query(`SELECT
         u.id,
         u.full_name,
         u.organization_id,
         u.role AS base_role,
         u.user_role AS secondary_role,
         u.status AS user_status,
         o.name AS org_name,
         o.code AS org_code,
         o.status AS org_status
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE (u.normalized_mobile_number = $1
           OR u.phone_number = $1
           OR u.mobile_number = $1
           OR u.normalized_mobile_number LIKE $2
           OR u.phone_number LIKE $2
           OR u.mobile_number LIKE $2)
       ORDER BY
         (CASE WHEN UPPER(COALESCE(u.status, '')) = 'ACTIVE' THEN 1 ELSE 2 END),
         (CASE
            WHEN UPPER(COALESCE(u.user_role, u.role, '')) = 'SUPER_ADMIN' THEN 1
            WHEN UPPER(COALESCE(u.user_role, u.role, '')) IN ('PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN') THEN 2
            ELSE 3
          END)
       LIMIT 1;`, [e164Phone, `%${clean10}`]);
    }
    catch (err) {
        logger.error({ error: err?.message }, 'Database failure during administrator lookup');
        throw new UnauthorizedError('Unable to verify administrator account.');
    }
    if (!res || !res.rows || res.rows.length === 0) {
        throw new UnauthorizedError('No authorized administrator account found for this mobile number.');
    }
    const row = res.rows[0];
    if (String(row.user_status || '').toUpperCase() !== 'ACTIVE') {
        throw new UnauthorizedError('Administrator account is suspended or inactive.');
    }
    const roleCandidates = [row.secondary_role, row.base_role]
        .filter((r) => typeof r === 'string' && r.trim().length > 0)
        .map((r) => r.trim().toUpperCase());
    const resolvedRole = roleCandidates.find((r) => ALLOWED_ADMIN_ROLES.has(r));
    if (!resolvedRole) {
        throw new UnauthorizedError('This account is not authorized for Administrator access.');
    }
    const isPlatformStaff = PLATFORM_ADMIN_ROLES.has(resolvedRole);
    if (!isPlatformStaff) {
        if (!row.organization_id || !row.org_name || !row.org_code) {
            throw new UnauthorizedError('No active Dairy cooperative assigned to this administrator account.');
        }
        if (String(row.org_status || '').toUpperCase() !== 'ACTIVE') {
            throw new UnauthorizedError('Assigned dairy cooperative is currently inactive or suspended.');
        }
    }
    return {
        id: row.id,
        fullName: row.full_name || 'Administrator',
        organizationId: row.organization_id || null,
        role: resolvedRole,
        orgName: row.org_name || null,
        orgCode: row.org_code || null,
    };
}
export class RequestAdminOtpUseCase {
    otpService;
    constructor(otpService) {
        this.otpService = otpService;
    }
    async execute(rawPhone, ipAddress) {
        const phone = new PhoneNumber(rawPhone);
        await resolveActiveAdminByPhone(phone.e164);
        return this.otpService.sendOtp(phone.e164, 'ADMIN_LOGIN', ipAddress);
    }
}
export class VerifyAdminOtpUseCase {
    otpService;
    tokenService;
    constructor(otpService, tokenService) {
        this.otpService = otpService;
        this.tokenService = tokenService;
    }
    async execute(rawPhone, otp) {
        const phone = new PhoneNumber(rawPhone);
        // Pre-verify active administrator record exists before validating OTP
        await resolveActiveAdminByPhone(phone.e164);
        const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'ADMIN_LOGIN');
        if (!isValid) {
            throw new DomainValidationError('Invalid or expired Admin OTP.');
        }
        // Re-verify persisted DB record atomically after OTP verification
        const admin = await resolveActiveAdminByPhone(phone.e164);
        const isPlatformStaff = PLATFORM_ADMIN_ROLES.has(admin.role);
        const dairyId = admin.organizationId || (isPlatformStaff ? '00000000-0000-0000-0000-000000000001' : '');
        const dairyName = admin.orgName || (isPlatformStaff ? 'DFarm Platform Federation' : '');
        const dairyCode = admin.orgCode || (isPlatformStaff ? 'DF-PLATFORM' : '');
        if (!isPlatformStaff && !dairyId) {
            throw new UnauthorizedError('No active Dairy cooperative assigned to this administrator account.');
        }
        const token = this.tokenService.signToken({
            userId: admin.id,
            organizationId: dairyId,
            role: admin.role,
            actorType: 'STAFF',
        }, 24 * 3600); // 24 hours
        const refreshToken = this.tokenService.signToken({
            userId: admin.id,
            organizationId: dairyId,
            role: admin.role,
            actorType: 'STAFF',
        }, 30 * 86400); // 30 days
        return {
            token,
            refreshToken,
            expiresIn: 24 * 3600,
            user: {
                id: admin.id,
                phone: phone.e164,
                role: admin.role,
                actorType: 'STAFF',
                name: admin.fullName,
                fullName: admin.fullName,
                dairyId,
                dairyName,
                dairyCode,
            },
        };
    }
}
//# sourceMappingURL=AdminAuthUseCases.js.map