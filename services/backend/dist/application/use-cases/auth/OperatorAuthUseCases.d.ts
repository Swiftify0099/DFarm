import { IOtpService, ITokenService } from '../../ports/index.js';
export declare class RequestOperatorOtpUseCase {
    private readonly otpService;
    constructor(otpService: IOtpService);
    execute(rawPhone: string): Promise<{
        success: boolean;
        message: string;
        previewOtp?: string;
    }>;
}
export declare class VerifyOperatorOtpUseCase {
    private readonly otpService;
    private readonly tokenService;
    constructor(otpService: IOtpService, tokenService: ITokenService);
    execute(rawPhone: string, otp: string): Promise<{
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
    }>;
}
//# sourceMappingURL=OperatorAuthUseCases.d.ts.map