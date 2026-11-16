import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { doveOtpService } from '../../../infrastructure/otp/DoveOtpService.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
export class RequestAdminOtpUseCase {
    otpService;
    constructor(otpService) {
        this.otpService = otpService;
    }
    async execute(rawPhone, _ipAddress) {
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
    otpService;
    tokenService;
    constructor(otpService, tokenService) {
        this.otpService = otpService;
        this.tokenService = tokenService;
    }
    async execute(rawPhone, otp) {
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
        const isPankaj = phone.e164.endsWith('7755995615');
        const role = isPankaj ? 'SUPER_ADMIN' : 'PRIMARY_DAIRY_ADMIN';
        let adminName = isPankaj ? 'Pankaj Popat Yewale' : 'Dairy Administrator';
        let dairyId = '00000000-0000-0000-0000-000000000001';
        let dairyName = 'Gokul Primary Cooperative';
        let dairyCode = 'GOKUL-01';
        try {
            const clean10 = phone.e164.replace(/\D/g, '').slice(-10);
            const res = await db.query(`SELECT u.id, u.full_name, u.organization_id, o.name AS org_name, o.code AS org_code
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE (u.normalized_mobile_number LIKE $1 OR u.phone_number LIKE $1) LIMIT 1;`, [`%${clean10}`]);
            if (res.rows.length > 0) {
                if (res.rows[0].full_name)
                    adminName = res.rows[0].full_name;
                if (res.rows[0].organization_id)
                    dairyId = res.rows[0].organization_id;
                if (res.rows[0].org_name)
                    dairyName = res.rows[0].org_name;
                if (res.rows[0].org_code)
                    dairyCode = res.rows[0].org_code;
            }
        }
        catch {
            // Postgres lookup failed or not connected
        }
        const token = this.tokenService.signToken({
            userId: `admin:${phone.e164}`,
            role: isPankaj ? 'super_admin' : 'dairy_admin',
            actorType: 'STAFF',
        }, 24 * 3600); // 24 hours
        const refreshToken = this.tokenService.signToken({
            userId: `admin:${phone.e164}`,
            role: isPankaj ? 'super_admin' : 'dairy_admin',
            actorType: 'STAFF',
        }, 30 * 86400); // 30 days
        return {
            token,
            refreshToken,
            expiresIn: 24 * 3600,
            user: {
                id: `admin:${phone.e164}`,
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
//# sourceMappingURL=AdminAuthUseCases.js.map