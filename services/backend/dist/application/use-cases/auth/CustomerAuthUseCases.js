import crypto from 'node:crypto';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { DomainValidationError, UnauthorizedError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { PostgresCustomerMembershipRepository } from '../../../infrastructure/repositories/PostgresCustomerMembershipRepository.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { tokenRevocationService } from '../../../infrastructure/security/TokenRevocationService.js';
import { accountAuthorityService } from '../../../infrastructure/security/AccountAuthorityService.js';
export class RequestCustomerOtpUseCase {
    otpService;
    constructor(otpService) {
        this.otpService = otpService;
    }
    async execute(rawPhone) {
        const phone = new PhoneNumber(rawPhone);
        return this.otpService.sendOtp(phone.e164, 'CUSTOMER_AUTH');
    }
}
export class VerifyCustomerOtpUseCase {
    otpService;
    tokenService;
    customerRepository;
    membershipRepo;
    constructor(otpService, tokenService, customerRepository, membershipRepository) {
        this.otpService = otpService;
        this.tokenService = tokenService;
        this.customerRepository = customerRepository;
        this.membershipRepo = membershipRepository || new PostgresCustomerMembershipRepository();
    }
    async execute(rawPhone, otp) {
        const phone = new PhoneNumber(rawPhone);
        const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'CUSTOMER_AUTH');
        if (!isValid) {
            throw new DomainValidationError('Invalid or expired OTP.');
        }
        // 1. Resolve or create canonical Global Customer Identity
        let globalIdentity = await this.membershipRepo.findGlobalIdentityByPhone(phone.e164);
        if (!globalIdentity) {
            globalIdentity = await this.membershipRepo.createGlobalIdentity(phone.e164);
        }
        // 2. Discover all memberships registered to this identity
        let memberships = await this.membershipRepo.listMembershipsByGlobalId(globalIdentity.id);
        // 3. Fallback: Check if pre-existing customer exists in tenant database but isn't mapped yet
        if (memberships.length === 0) {
            const legacyCustomer = await this.customerRepository.findByPhone(phone.e164);
            if (legacyCustomer) {
                let dairyName = 'DFarm Cooperative Society';
                let dairyCode = 'DFARM';
                let dairyAddress = 'Regional Center';
                try {
                    const orgRes = await db.query(`SELECT name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`, [legacyCustomer.organizationId]);
                    if (orgRes.rows.length > 0) {
                        dairyName = orgRes.rows[0].name || dairyName;
                        dairyCode = orgRes.rows[0].code || dairyCode;
                        dairyAddress = orgRes.rows[0].address_line1 || dairyAddress;
                    }
                }
                catch { }
                const mappedMembership = new CustomerMembership({
                    id: crypto.randomUUID(),
                    globalCustomerId: globalIdentity.id,
                    organizationId: legacyCustomer.organizationId,
                    tenantCustomerId: legacyCustomer.id,
                    farmerCode: legacyCustomer.farmerCode,
                    customerName: legacyCustomer.fullName,
                    membershipStatus: legacyCustomer.registrationStatus || (legacyCustomer.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL'),
                    dairyName,
                    dairyCode,
                    dairyAddress,
                    centerId: legacyCustomer.centerId,
                    centerName: 'Main Collection Center',
                });
                await this.membershipRepo.saveMembership(mappedMembership);
                memberships = [mappedMembership];
            }
        }
        if (memberships.length === 0) {
            // Customer is not registered yet - provide guest registration token
            const guestId = globalIdentity.id;
            const regToken = this.tokenService.signToken({
                userId: `unregistered:${phone.e164}`,
                globalCustomerId: globalIdentity.id,
                role: 'GUEST_FARMER',
                actorType: 'CUSTOMER',
                tokenType: 'access',
            }, 3600); // 1 hour registration window
            return {
                accessToken: regToken,
                refreshToken: regToken,
                expiresIn: 3600,
                isRegistered: false,
                globalCustomerId: globalIdentity.id,
                memberships: [],
                user: {
                    id: guestId,
                    globalCustomerId: globalIdentity.id,
                    mobileNumber: phone.e164,
                    status: 'UNREGISTERED',
                    selectedDairyId: null,
                    customerProfile: null,
                },
                token: regToken,
                customer: {
                    id: guestId,
                    mobileNumber: phone.e164,
                    registrationStatus: 'UNREGISTERED',
                },
            };
        }
        // Pick active membership: prefer first APPROVED, otherwise first available
        const activeMembership = memberships.find((m) => m.isApproved) || memberships[0];
        let resolvedCustomerName = activeMembership.customerName;
        if (!resolvedCustomerName && this.customerRepository) {
            try {
                const cust = await this.customerRepository.findById(activeMembership.tenantCustomerId, activeMembership.organizationId);
                if (cust?.fullName) {
                    resolvedCustomerName = cust.fullName;
                }
            }
            catch { }
        }
        const finalCustomerName = resolvedCustomerName || (activeMembership.farmerCode ? `Farmer ${activeMembership.farmerCode}` : 'Valued Farmer');
        const token = this.tokenService.signToken({
            userId: activeMembership.tenantCustomerId,
            organizationId: activeMembership.organizationId,
            centerId: activeMembership.centerId || undefined,
            globalCustomerId: globalIdentity.id,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
            tokenType: 'access',
        });
        const refreshToken = this.tokenService.signToken({
            userId: activeMembership.tenantCustomerId,
            organizationId: activeMembership.organizationId,
            centerId: activeMembership.centerId || undefined,
            globalCustomerId: globalIdentity.id,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
            tokenType: 'refresh',
        }, 30 * 86400); // 30 days
        const statusMapping = activeMembership.membershipStatus === 'APPROVED' ? 'APPROVED' :
            activeMembership.membershipStatus === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' :
                activeMembership.membershipStatus === 'REJECTED' ? 'REJECTED' :
                    activeMembership.membershipStatus === 'SUSPENDED' ? 'SUSPENDED' : 'UNREGISTERED';
        return {
            accessToken: token,
            refreshToken,
            expiresIn: 86400,
            isRegistered: true,
            globalCustomerId: globalIdentity.id,
            memberships: memberships.map((m) => m.toJSON()),
            user: {
                id: activeMembership.tenantCustomerId,
                globalCustomerId: globalIdentity.id,
                mobileNumber: phone.e164,
                status: statusMapping,
                selectedDairyId: activeMembership.organizationId,
                customerProfile: {
                    name: finalCustomerName,
                    dairyName: activeMembership.dairyName,
                    village: activeMembership.dairyAddress || undefined,
                },
            },
            token,
            customer: {
                id: activeMembership.tenantCustomerId,
                farmerCode: activeMembership.farmerCode || undefined,
                fullName: finalCustomerName,
                mobileNumber: phone.e164,
                registrationStatus: activeMembership.membershipStatus,
                organizationId: activeMembership.organizationId,
                centerId: activeMembership.centerId || undefined,
            },
        };
    }
}
export class RefreshTokenUseCase {
    tokenService;
    constructor(tokenService) {
        this.tokenService = tokenService;
    }
    async execute(oldToken) {
        if (!oldToken || typeof oldToken !== 'string' || !oldToken.trim()) {
            throw new UnauthorizedError('Refresh token is required', 'MISSING_REFRESH_TOKEN');
        }
        const cleanToken = oldToken.startsWith('Bearer ') ? oldToken.slice(7).trim() : oldToken.trim();
        const claims = this.tokenService.verifyToken(cleanToken);
        if (claims.tokenType !== 'refresh') {
            throw new UnauthorizedError('Invalid token type: refresh token required', 'INVALID_TOKEN_TYPE');
        }
        if (claims.role === 'GUEST_FARMER' || String(claims.userId || '').startsWith('unregistered:')) {
            throw new UnauthorizedError('Unregistered guest tokens cannot be refreshed', 'INVALID_REFRESH_ACTOR');
        }
        let resolvedRole = claims.role;
        let resolvedOrgId = claims.organizationId;
        let resolvedCenterId = claims.centerId;
        if (claims.actorType === 'STAFF') {
            const staff = await accountAuthorityService.verifyStaff({
                userId: claims.userId,
                claimedOrganizationId: claims.organizationId,
                loadCenterAssignments: false,
            });
            if (!staff) {
                throw new UnauthorizedError('Staff account no longer exists', 'USER_NOT_FOUND');
            }
            resolvedRole = staff.role;
            resolvedOrgId = staff.organizationId || resolvedOrgId;
        }
        else {
            const customer = await accountAuthorityService.verifyCustomer({
                userId: claims.userId,
                claimedRole: claims.role,
                organizationId: claims.organizationId,
                globalCustomerId: claims.globalCustomerId,
                allowGuestFarmer: false,
                strictActiveOnly: true,
            });
            if (!customer) {
                throw new UnauthorizedError('Customer account or membership could not be verified', 'USER_NOT_FOUND');
            }
            resolvedOrgId = customer.organizationId || resolvedOrgId;
            resolvedCenterId = customer.centerId || resolvedCenterId;
            resolvedRole = 'FARMER_CUSTOMER';
        }
        // Atomically consume the single-use refresh token across all backend instances.
        // Concurrent simultaneous requests race on INSERT ... ON CONFLICT DO NOTHING RETURNING token_key;
        // strictly one caller succeeds and all replays/concurrent siblings fail with 401 TOKEN_REVOKED.
        const consumed = await tokenRevocationService.tryConsumeSingleUseToken({
            token: cleanToken,
            jti: claims.jti,
            expiresAtSeconds: claims.exp,
            reason: 'REFRESH_ROTATED',
        });
        if (!consumed) {
            throw new UnauthorizedError('Refresh token has been revoked or already consumed', 'TOKEN_REVOKED');
        }
        const accessTtl = claims.actorType === 'STAFF' ? 24 * 3600 : 86400;
        const accessToken = this.tokenService.signToken({
            userId: claims.userId,
            organizationId: resolvedOrgId,
            centerId: resolvedCenterId,
            globalCustomerId: claims.globalCustomerId,
            role: resolvedRole,
            actorType: claims.actorType,
            deviceId: claims.deviceId,
            tokenType: 'access',
        }, accessTtl);
        const nextRefreshToken = this.tokenService.signToken({
            userId: claims.userId,
            organizationId: resolvedOrgId,
            centerId: resolvedCenterId,
            globalCustomerId: claims.globalCustomerId,
            role: resolvedRole,
            actorType: claims.actorType,
            deviceId: claims.deviceId,
            tokenType: 'refresh',
        }, 30 * 86400);
        return {
            token: accessToken,
            accessToken,
            refreshToken: nextRefreshToken,
            expiresIn: accessTtl,
        };
    }
}
//# sourceMappingURL=CustomerAuthUseCases.js.map