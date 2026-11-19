import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { doveOtpService } from '../../../infrastructure/otp/DoveOtpService.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { config } from '../../../config/env.js';
import { getInMemoryDairyByPhone, getAllInMemoryDairies } from '../../../infrastructure/database/InMemoryDairyStore.js';
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
        const clean10 = phone.e164.replace(/\D/g, '').slice(-10);
        const isPlatformStaffPhone = phone.e164.endsWith('7755995615') || clean10 === '7755995615';
        let row = null;
        try {
            const res = await db.query(`SELECT 
           u.id, 
           u.full_name, 
           u.organization_id, 
           COALESCE(u.role, u.user_role) AS role, 
           u.status AS user_status, 
           o.name AS org_name, 
           o.code AS org_code, 
           o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.phone_number LIKE $1 
            OR u.normalized_mobile_number LIKE $1
            OR u.mobile_number LIKE $1
         LIMIT 1;`, [`%${clean10}`]);
            if (res.rows.length > 0) {
                row = res.rows[0];
                // If account exists in inactive/draft state, auto-activate upon verified OTP login
                if (row.user_status && row.user_status.toUpperCase() !== 'ACTIVE') {
                    try {
                        await db.query(`UPDATE users SET status = 'ACTIVE', activated_at = NOW() WHERE id = $1;`, [row.id]);
                        if (row.organization_id) {
                            await db.query(`UPDATE organizations SET primary_admin_activated = TRUE, status = 'ACTIVE' WHERE id = $1;`, [row.organization_id]);
                        }
                        row.user_status = 'ACTIVE';
                        row.org_status = 'ACTIVE';
                    }
                    catch {
                        row.user_status = 'ACTIVE';
                    }
                }
            }
            else if (isPlatformStaffPhone) {
                // Auto-provision Super Admin Pankaj Popat Yewale if not present
                try {
                    let orgId = '00000000-0000-0000-0000-000000000001';
                    const orgRes = await db.query(`SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1;`);
                    if (orgRes.rows.length > 0) {
                        orgId = orgRes.rows[0].id;
                    }
                    const insertRes = await db.query(`INSERT INTO users (
               id, organization_id, username, full_name, email, 
               phone_number, mobile_number, normalized_mobile_number, role, user_role, status
             )
             VALUES (
               '00000000-0000-0000-0000-000000000099',
               $1,
               'pankaj.yewale',
               'Pankaj Popat Yewale',
               'pankaj.yewale@dfarm.in',
               '+917755995615',
               '+917755995615',
               '+917755995615',
               'SUPER_ADMIN',
               'SUPER_ADMIN',
               'ACTIVE'
             )
             ON CONFLICT (id) DO UPDATE SET
               full_name = 'Pankaj Popat Yewale',
               phone_number = '+917755995615',
               mobile_number = '+917755995615',
               normalized_mobile_number = '+917755995615',
               role = 'SUPER_ADMIN',
               user_role = 'SUPER_ADMIN',
               status = 'ACTIVE'
             RETURNING id, full_name, organization_id, role, status AS user_status;`, [orgId]);
                    if (insertRes.rows.length > 0) {
                        row = {
                            ...insertRes.rows[0],
                            org_name: 'DFarm Platform Federation',
                            org_code: 'DF-PLATFORM',
                            org_status: 'ACTIVE',
                        };
                    }
                }
                catch {
                    // Fallback applied below
                }
            }
            else {
                // Dynamic Dairy Admin Organization Resolution
                // 1. Check inMemoryDairies by phone or admin contact
                const inMemDairy = getInMemoryDairyByPhone(phone.e164);
                let targetOrg = null;
                if (inMemDairy) {
                    targetOrg = {
                        id: inMemDairy.id,
                        name: inMemDairy.name,
                        code: inMemDairy.code,
                        status: inMemDairy.status || 'ACTIVE',
                        adminName: inMemDairy.primaryAdminName,
                    };
                }
                else {
                    // 2. Query organizations table by business phone or name match
                    try {
                        const orgRes = await db.query(`SELECT id, name, code, status FROM organizations 
               WHERE business_phone LIKE $1 
                  OR business_phone LIKE $2
                  OR code = 'DF-SAN-2395'
                  OR ($3::text LIKE '%9834388787%' AND LOWER(name) LIKE '%warna%')
                  OR ($3::text LIKE '%7507495615%' AND LOWER(name) LIKE '%warna%')
               ORDER BY created_at DESC LIMIT 1;`, [`%${clean10}%`, `%+91${clean10}%`, phone.e164]);
                        if (orgRes.rows.length > 0) {
                            targetOrg = orgRes.rows[0];
                        }
                    }
                    catch { }
                }
                if (!targetOrg) {
                    // Check all in memory dairies for matching name if Warna admin
                    if (clean10 === '9834388787' || clean10 === '7507495615') {
                        const allDairies = getAllInMemoryDairies();
                        const warnaDairy = allDairies.find((d) => (d.name && d.name.toLowerCase().includes('warna')) || d.code === 'DF-SAN-2395');
                        if (warnaDairy) {
                            targetOrg = {
                                id: warnaDairy.id,
                                name: warnaDairy.name,
                                code: warnaDairy.code,
                                status: warnaDairy.status || 'ACTIVE',
                                adminName: warnaDairy.primaryAdminName,
                            };
                        }
                    }
                }
                if (!targetOrg && (config.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production')) {
                    try {
                        const anyOrg = await db.query(`SELECT id, name, code, status FROM organizations WHERE id != '00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 1;`);
                        if (anyOrg.rows.length > 0)
                            targetOrg = anyOrg.rows[0];
                    }
                    catch { }
                }
                if (targetOrg) {
                    const adminId = clean10 === '9834388787'
                        ? '37b8de06-0023-4935-b1bb-3d7152065e6e'
                        : clean10 === '7507495615'
                            ? '272d8a02-b1c8-4a70-b23a-da5565ea77b3'
                            : crypto.randomUUID();
                    const adminFullName = targetOrg.adminName ||
                        (clean10 === '9834388787'
                            ? 'popat yewale'
                            : clean10 === '7507495615'
                                ? 'Warna Dairy Admin'
                                : 'Dairy Administrator');
                    try {
                        await db.query(`INSERT INTO users (
                 id, organization_id, username, full_name, email,
                 phone_number, mobile_number, normalized_mobile_number,
                 role, user_role, status, activated_at
               ) VALUES (
                 $1, $2, $3, $4, $5,
                 $6, $6, $6, 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'ACTIVE', NOW()
               )
               ON CONFLICT (id) DO UPDATE SET
                 organization_id = EXCLUDED.organization_id,
                 status = 'ACTIVE',
                 role = 'DAIRY_ADMIN',
                 user_role = 'PRIMARY_DAIRY_ADMIN',
                 phone_number = EXCLUDED.phone_number,
                 mobile_number = EXCLUDED.mobile_number,
                 normalized_mobile_number = EXCLUDED.normalized_mobile_number,
                 activated_at = NOW();`, [adminId, targetOrg.id, `admin_${clean10}`, adminFullName, `admin_${clean10}@dfarm.in`, `+91${clean10}`]);
                        await db.query(`UPDATE organizations SET primary_admin_activated = TRUE, activated_at = NOW(), status = 'ACTIVE' WHERE id = $1;`, [targetOrg.id]);
                    }
                    catch {
                        // DB temporarily unavailable or pool reconnecting
                    }
                    row = {
                        id: adminId,
                        full_name: adminFullName,
                        organization_id: targetOrg.id,
                        role: 'DAIRY_ADMIN',
                        user_status: 'ACTIVE',
                        org_name: targetOrg.name,
                        org_code: targetOrg.code,
                        org_status: 'ACTIVE',
                    };
                }
            }
        }
        catch {
            // DB temporarily unavailable or pool reconnecting
        }
        // Fail-safe guarantee for superadmin Pankaj Popat Yewale
        if (!row && isPlatformStaffPhone) {
            row = {
                id: '00000000-0000-0000-0000-000000000099',
                full_name: 'Pankaj Popat Yewale',
                organization_id: '00000000-0000-0000-0000-000000000001',
                role: 'SUPER_ADMIN',
                user_status: 'ACTIVE',
                org_name: 'DFarm Platform Federation',
                org_code: 'DF-PLATFORM',
                org_status: 'ACTIVE',
            };
        }
        // Dynamic fail-safe guarantee for Warna Milk's Primary Dairy Admin (Popat Yewale / Warna Admin)
        if (!row && (clean10 === '9834388787' || clean10 === '7507495615')) {
            const inMem = getInMemoryDairyByPhone(phone.e164) ||
                getAllInMemoryDairies().find((d) => (d.name && d.name.toLowerCase().includes('warna')) || d.code === 'DF-SAN-2395');
            const warnaOrgId = inMem?.id || '38918630-4fee-4cec-96ea-a3a899aae7bc';
            const warnaOrgName = inMem?.name || "Warna Milk's";
            const warnaOrgCode = inMem?.code || 'DF-SAN-2395';
            const adminName = inMem?.primaryAdminName ||
                (clean10 === '9834388787' ? 'popat yewale' : 'Warna Dairy Admin');
            const adminId = clean10 === '9834388787'
                ? '37b8de06-0023-4935-b1bb-3d7152065e6e'
                : '272d8a02-b1c8-4a70-b23a-da5565ea77b3';
            row = {
                id: adminId,
                full_name: adminName,
                organization_id: warnaOrgId,
                role: 'DAIRY_ADMIN',
                user_status: 'ACTIVE',
                org_name: warnaOrgName,
                org_code: warnaOrgCode,
                org_status: 'ACTIVE',
            };
        }
        if (!row) {
            throw new UnauthorizedError('No authorized administrator account found for this mobile number.');
        }
        if (row.user_status && row.user_status.toUpperCase() !== 'ACTIVE') {
            throw new UnauthorizedError('Administrator account is suspended or inactive.');
        }
        const isSuperAdmin = row.role === 'SUPER_ADMIN' || phone.e164.endsWith('7755995615');
        if (!isSuperAdmin) {
            if (!row.organization_id || !row.org_name || !row.org_code) {
                throw new UnauthorizedError('No active Dairy cooperative assigned to this administrator account.');
            }
            if (row.org_status && row.org_status.toUpperCase() !== 'ACTIVE') {
                throw new UnauthorizedError(`Assigned dairy cooperative (${row.org_name}) is currently inactive or suspended.`);
            }
        }
        const role = isSuperAdmin ? 'SUPER_ADMIN' : (row.role || 'PRIMARY_DAIRY_ADMIN');
        const adminName = row.full_name || (isSuperAdmin ? 'Pankaj Popat Yewale' : 'Dairy Administrator');
        const dairyId = row.organization_id || '00000000-0000-0000-0000-000000000001';
        const dairyName = row.org_name || 'DFarm Platform Federation';
        const dairyCode = row.org_code || 'DF-PLATFORM';
        const token = this.tokenService.signToken({
            userId: row.id,
            organizationId: dairyId,
            role: isSuperAdmin ? 'SUPER_ADMIN' : 'dairy_admin',
            actorType: 'STAFF',
        }, 24 * 3600); // 24 hours
        const refreshToken = this.tokenService.signToken({
            userId: row.id,
            organizationId: dairyId,
            role: isSuperAdmin ? 'SUPER_ADMIN' : 'dairy_admin',
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
//# sourceMappingURL=AdminAuthUseCases.js.map