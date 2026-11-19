import { DomainValidationError, CustomerNotFoundError } from '../../../domain/errors/index.js';
export class SelectDairyMembershipUseCase {
    membershipRepo;
    tokenService;
    customerRepo;
    constructor(membershipRepo, tokenService, customerRepo) {
        this.membershipRepo = membershipRepo;
        this.tokenService = tokenService;
        this.customerRepo = customerRepo;
    }
    async execute(params) {
        let globalCustomerId = params.globalCustomerId;
        if (!globalCustomerId && params.phone) {
            const identity = await this.membershipRepo.findGlobalIdentityByPhone(params.phone);
            if (identity) {
                globalCustomerId = identity.id;
            }
        }
        if (!globalCustomerId && params.tenantCustomerId && this.customerRepo) {
            const customer = await this.customerRepo.findById(params.tenantCustomerId, params.dairyId);
            if (customer?.globalCustomerId) {
                globalCustomerId = customer.globalCustomerId;
            }
            else if (customer?.mobileNumber) {
                const identity = await this.membershipRepo.findGlobalIdentityByPhone(customer.mobileNumber);
                if (identity)
                    globalCustomerId = identity.id;
            }
        }
        if (!globalCustomerId) {
            throw new DomainValidationError('Global customer identity could not be resolved.');
        }
        const membership = await this.membershipRepo.findMembership(globalCustomerId, params.dairyId);
        if (!membership) {
            throw new CustomerNotFoundError(`Membership for dairy ${params.dairyId}`);
        }
        if (membership.membershipStatus !== 'APPROVED') {
            throw new DomainValidationError(`Cannot switch to ${membership.dairyName}: registration status is ${membership.membershipStatus}. Only approved memberships can be selected.`);
        }
        // Sign new tenant-scoped access token
        const accessToken = this.tokenService.signToken({
            userId: membership.tenantCustomerId,
            organizationId: membership.organizationId,
            centerId: membership.centerId || undefined,
            globalCustomerId: membership.globalCustomerId,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
        }, 86400);
        const refreshToken = this.tokenService.signToken({
            userId: membership.tenantCustomerId,
            organizationId: membership.organizationId,
            centerId: membership.centerId || undefined,
            globalCustomerId: membership.globalCustomerId,
            role: 'FARMER_CUSTOMER',
            actorType: 'CUSTOMER',
        }, 30 * 86400);
        return {
            accessToken,
            refreshToken,
            expiresIn: 86400,
            selectedDairy: {
                dairyId: membership.organizationId,
                dairyName: membership.dairyName,
                dairyCode: membership.dairyCode,
                farmerCode: membership.farmerCode,
                tenantCustomerId: membership.tenantCustomerId,
                membershipStatus: membership.membershipStatus,
                centerId: membership.centerId,
                centerName: membership.centerName,
            },
            user: {
                id: membership.tenantCustomerId,
                globalCustomerId: membership.globalCustomerId,
                selectedDairyId: membership.organizationId,
                status: membership.membershipStatus,
                farmerCode: membership.farmerCode,
                customerProfile: {
                    name: membership.dairyName,
                    dairyName: membership.dairyName,
                },
            },
        };
    }
}
//# sourceMappingURL=SelectDairyMembershipUseCase.js.map