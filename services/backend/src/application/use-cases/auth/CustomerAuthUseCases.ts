import crypto from 'node:crypto';
import { IOtpService, ITokenService, ICustomerRepository, ICustomerMembershipRepository } from '../../ports/index.js';
import { CustomerMembership } from '../../../domain/entities/CustomerMembership.js';
import { DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';
import { PostgresCustomerMembershipRepository } from '../../../infrastructure/repositories/PostgresCustomerMembershipRepository.js';
import { db } from '../../../infrastructure/database/PostgresPool.js';

export class RequestCustomerOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string): Promise<{ success: boolean; message: string; cooldownSeconds?: number; expiresAt?: string; previewOtp?: string }> {
    const phone = new PhoneNumber(rawPhone);
    return this.otpService.sendOtp(phone.e164, 'CUSTOMER_AUTH');
  }
}

export interface CustomerAuthSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isRegistered: boolean;
  globalCustomerId?: string;
  memberships?: Array<{
    id: string;
    organizationId: string;
    dairyId: string;
    dairyName: string;
    dairyCode?: string | null;
    dairyAddress?: string | null;
    centerId?: string | null;
    centerName?: string | null;
    farmerCode?: string | null;
    membershipStatus: string;
    status: string;
    isApproved: boolean;
    createdAt?: string;
  }>;
  user: {
    id: string;
    globalCustomerId?: string;
    mobileNumber: string;
    status: 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
    selectedDairyId: string | null;
    customerProfile: {
      name: string;
      dairyName: string;
      village?: string;
    } | null;
  };
  // Backwards-compatibility fields
  token: string;
  customer: {
    id?: string;
    farmerCode?: string;
    fullName?: string;
    mobileNumber: string;
    registrationStatus: string;
    organizationId?: string;
    centerId?: string;
  };
}

export class VerifyCustomerOtpUseCase {
  private readonly membershipRepo: ICustomerMembershipRepository;

  constructor(
    private readonly otpService: IOtpService,
    private readonly tokenService: ITokenService,
    private readonly customerRepository: ICustomerRepository,
    membershipRepository?: ICustomerMembershipRepository
  ) {
    this.membershipRepo = membershipRepository || new PostgresCustomerMembershipRepository();
  }

  public async execute(rawPhone: string, otp: string): Promise<CustomerAuthSessionResult> {
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
          const orgRes = await db.query(
            `SELECT name, code, address_line1 FROM organizations WHERE id = $1 LIMIT 1;`,
            [legacyCustomer.organizationId]
          );
          if (orgRes.rows.length > 0) {
            dairyName = orgRes.rows[0].name || dairyName;
            dairyCode = orgRes.rows[0].code || dairyCode;
            dairyAddress = orgRes.rows[0].address_line1 || dairyAddress;
          }
        } catch {}

        const mappedMembership = new CustomerMembership({
          id: crypto.randomUUID(),
          globalCustomerId: globalIdentity.id,
          organizationId: legacyCustomer.organizationId,
          tenantCustomerId: legacyCustomer.id,
          farmerCode: legacyCustomer.farmerCode,
          membershipStatus: (legacyCustomer.registrationStatus as any) || (legacyCustomer.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_APPROVAL'),
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
    const activeMembership = memberships.find((m) => m.isApproved) || memberships[0]!;

    const token = this.tokenService.signToken({
      userId: activeMembership.tenantCustomerId,
      organizationId: activeMembership.organizationId,
      centerId: activeMembership.centerId || undefined,
      globalCustomerId: globalIdentity.id,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });

    const refreshToken = this.tokenService.signToken({
      userId: activeMembership.tenantCustomerId,
      organizationId: activeMembership.organizationId,
      centerId: activeMembership.centerId || undefined,
      globalCustomerId: globalIdentity.id,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    }, 30 * 86400); // 30 days

    const statusMapping: 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' =
      activeMembership.membershipStatus === 'APPROVED' ? 'APPROVED' :
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
          name: activeMembership.farmerCode || activeMembership.dairyName,
          dairyName: activeMembership.dairyName,
          village: activeMembership.dairyAddress || undefined,
        },
      },
      token,
      customer: {
        id: activeMembership.tenantCustomerId,
        farmerCode: activeMembership.farmerCode || undefined,
        fullName: activeMembership.dairyName,
        mobileNumber: phone.e164,
        registrationStatus: activeMembership.membershipStatus,
        organizationId: activeMembership.organizationId,
        centerId: activeMembership.centerId || undefined,
      },
    };
  }
}

export class RefreshTokenUseCase {
  constructor(private readonly tokenService: ITokenService) {}

  public execute(oldToken: string): { token: string } {
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
