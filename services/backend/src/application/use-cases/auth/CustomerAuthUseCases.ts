import crypto from 'node:crypto';
import { IOtpService, ITokenService, ICustomerRepository } from '../../ports/index.js';
import { DomainValidationError } from '../../../domain/errors/index.js';
import { PhoneNumber } from '../../../domain/value-objects/index.js';

export class RequestCustomerOtpUseCase {
  constructor(private readonly otpService: IOtpService) {}

  public async execute(rawPhone: string): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    const phone = new PhoneNumber(rawPhone);
    return this.otpService.sendOtp(phone.e164, 'CUSTOMER_AUTH');
  }
}

export interface CustomerAuthSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isRegistered: boolean;
  user: {
    id: string;
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
  constructor(
    private readonly otpService: IOtpService,
    private readonly tokenService: ITokenService,
    private readonly customerRepository: ICustomerRepository
  ) {}

  public async execute(rawPhone: string, otp: string): Promise<CustomerAuthSessionResult> {
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

    const statusMapping: 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' =
      customer.registrationStatus === 'APPROVED' ? 'APPROVED' :
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
