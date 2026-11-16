import { IOtpService, ITokenService, ICustomerRepository } from '../../ports/index.js';
export declare class RequestCustomerOtpUseCase {
    private readonly otpService;
    constructor(otpService: IOtpService);
    execute(rawPhone: string): Promise<{
        success: boolean;
        message: string;
        previewOtp?: string;
    }>;
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
export declare class VerifyCustomerOtpUseCase {
    private readonly otpService;
    private readonly tokenService;
    private readonly customerRepository;
    constructor(otpService: IOtpService, tokenService: ITokenService, customerRepository: ICustomerRepository);
    execute(rawPhone: string, otp: string): Promise<CustomerAuthSessionResult>;
}
export declare class RefreshTokenUseCase {
    private readonly tokenService;
    constructor(tokenService: ITokenService);
    execute(oldToken: string): {
        token: string;
    };
}
//# sourceMappingURL=CustomerAuthUseCases.d.ts.map