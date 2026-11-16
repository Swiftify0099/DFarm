import crypto from 'node:crypto';
import { DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
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
    constructor(otpService, tokenService, customerRepository) {
        this.otpService = otpService;
        this.tokenService = tokenService;
        this.customerRepository = customerRepository;
    }
    async execute(rawPhone, otp) {
        const phone = new PhoneNumber(rawPhone);
        const isValid = await this.otpService.verifyOtp(phone.e164, otp, 'CUSTOMER_AUTH');
        if (!isValid) {
            throw new DomainValidationError('Invalid or expired OTP.');
        }
        const customer = await this.customerRepository.findByPhone(phone.e164);
        if (!customer) {
            // Customer is not registered yet - provide guest registration token
            const guestId = crypto.randomUUID();
            const regToken = this.tokenService.signToken({
                userId: `unregistered:${phone.e164}`,
                role: 'GUEST_FARMER',
                actorType: 'CUSTOMER',
            }, 3600); // 1 hour registration window
            return {
                accessToken: regToken,
                refreshToken: regToken,
                expiresIn: 3600,
                isRegistered: false,
                user: {
                    id: guestId,
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
        const token = this.tokenService.signToken({
            userId: customer.id,
            organizationId: customer.organizationId,
            centerId: customer.centerId,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
        });
        const refreshToken = this.tokenService.signToken({
            userId: customer.id,
            organizationId: customer.organizationId,
            centerId: customer.centerId,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
        }, 30 * 86400); // 30 days
        const statusMapping = customer.registrationStatus === 'APPROVED' ? 'APPROVED' :
            customer.registrationStatus === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' :
                customer.registrationStatus === 'REJECTED' ? 'REJECTED' :
                    customer.registrationStatus === 'SUSPENDED' ? 'SUSPENDED' : 'UNREGISTERED';
        return {
            accessToken: token,
            refreshToken,
            expiresIn: 86400,
            isRegistered: true,
            user: {
                id: customer.id,
                mobileNumber: customer.mobileNumber,
                status: statusMapping,
                selectedDairyId: customer.organizationId || null,
                customerProfile: {
                    name: customer.fullName,
                    dairyName: '',
                    village: customer.village,
                },
            },
            token,
            customer: {
                id: customer.id,
                farmerCode: customer.farmerCode,
                fullName: customer.fullName,
                mobileNumber: customer.mobileNumber,
                registrationStatus: customer.registrationStatus,
                organizationId: customer.organizationId,
                centerId: customer.centerId,
            },
        };
    }
}
export class RefreshTokenUseCase {
    tokenService;
    constructor(tokenService) {
        this.tokenService = tokenService;
    }
    execute(oldToken) {
        const claims = this.tokenService.verifyToken(oldToken);
        const newToken = this.tokenService.signToken({
            userId: claims.userId,
            organizationId: claims.organizationId,
            centerId: claims.centerId,
            role: claims.role,
            actorType: claims.actorType,
        });
        return { token: newToken };
    }
}
//# sourceMappingURL=CustomerAuthUseCases.js.map